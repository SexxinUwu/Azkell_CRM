// ================================================================
// Módulo Reportes OT — Azkell Fleet
// Patrón SPA: window.* globals, init_reportes_ot() entry point
// Muestra histórico filtrable de Órdenes de Trabajo
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.rotData               = window.rotData               || [];
window.rotDatosFiltrados     = window.rotDatosFiltrados     || [];
window.rotDetalleId          = window.rotDetalleId          || null;
window.rotOtTrabajosActivos  = window.rotOtTrabajosActivos  || [];
window._rotFiltroEstado      = window._rotFiltroEstado      || '';
window.rotOtMaterialesActivos= window.rotOtMaterialesActivos|| [];
window.rotOtActivaId         = window.rotOtActivaId         || null;
window._rotMatIdx            = window._rotMatIdx            || 0;
window._rotInvData           = window._rotInvData           || [];
window._rotCatSituaciones    = window._rotCatSituaciones    || [];

window.rotBuscarOT = function(idOT) {
    if (!idOT) return null;
    var target = String(idOT).trim().toUpperCase();
    var match = (window.rotData || []).find(function(o){ 
        return String(o.ticket_entrada || o.id_ot || '').trim().toUpperCase() === target; 
    });
    if (match) return match;
    if (window.srOtData && Array.isArray(window.srOtData)) {
        match = window.srOtData.find(function(o){ 
            return String(o.ticket_entrada || o.id_ot || '').trim().toUpperCase() === target; 
        });
        if (match) return match;
    }
    return null;
};

window.rotObtenerOTAsync = async function(idOT) {
    var ot = window.rotBuscarOT(idOT);
    if (ot) return ot;
    try {
        var r1 = await fetch('/api/ordenes/by-ticket?id=' + encodeURIComponent(idOT));
        if (r1.ok) {
            ot = await r1.json();
            if (ot) return ot;
        }
    } catch(e) {}
    try {
        var r2 = await fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT));
        if (r2.ok) {
            ot = await r2.json();
            if (ot) return ot;
        }
    } catch(e) {}
    return null;
};

// ── Entry point ──────────────────────────────────────────────────
window.init_reportes_ot = function() {
    if (!window.checkPerm('reportes_ot', 'l')) {
        var wrap = document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    window._rotFiltroEstado = '';
    window.rotCargar();
    rotCargarSituaciones();
    if (typeof window.initColPicker === 'function') {
        window.initColPicker('col-picker-rot', 'rot-tabla', [
            {label: 'N° OT',        idx: 1, visible: true},
            {label: 'Placa',        idx: 2, visible: true},
            {label: 'Tipo / Sub',   idx: 3, visible: true},
            {label: 'Supervisor',   idx: 4, visible: true},
            {label: 'Situación',    idx: 5, visible: true},
            {label: 'Observaciones',idx: 6, visible: true},
            {label: 'Costo Total',  idx: 7, visible: true},
            {label: 'Fecha',        idx: 8, visible: true}
        ], 'fleet_cols_rot');
    }
};

// ── Carga catálogo de situaciones ────────────────────────────────
function rotCargarSituaciones() {
    fetch('/api/catalogos_taller')
        .then(function(r) { return r.ok ? r.json() : {}; })
        .then(function(d) {
            window._rotCatSituaciones = (d && d.situaciones) ? d.situaciones : [];
            window._rotCatRampas = (d && d.rampas) ? d.rampas : [];
            rotPoblarSelectSituacion();
        })
        .catch(function() {});
}

function rotPoblarSelectSituacion() {
    var sel = document.getElementById('rot-eot-situacion');
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = '<option value="">— Seleccionar —</option>' +
        window._rotCatSituaciones.map(function(s) {
            var l = s.descripcion || s.nombre || '';
            return '<option value="' + l.replace(/"/g,'&quot;') + '">' + l + '</option>';
        }).join('');
    if (current) sel.value = current;
}

// ── Carga desde API ──────────────────────────────────────────────
window.rotCargar = function() {
    var tbody = document.getElementById('rot-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="td-empty"><span class="spinner-border spinner-border-sm me-2"></span>Cargando...</td></tr>';

    fetch('/api/ordenes-trabajo')
        .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function(data) {
            window.rotData = Array.isArray(data) ? data : [];
            rotActualizarKPIs(window.rotData);
            window.rotFiltrar();
        })
        .catch(function(err) {
            console.error('Reportes OT: error al cargar:', err);
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al cargar las OTs', 'danger');
            if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="td-empty">Error al cargar datos.</td></tr>';
        });
};

// ── Chips de estado ───────────────────────────────────────────────
window.rotChipEstado = function(btn, estado) {
    document.querySelectorAll('#moduloReportesOT .rot-chip').forEach(function(c) { c.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    window._rotFiltroEstado = estado || '';
    window.rotFiltrar();
};

// ── Filtrar ──────────────────────────────────────────────────────
window.rotFiltrar = function() {
    var libre   = (rotVal('rot-busqueda-libre') || rotVal('rotMobileSearch')).toLowerCase();
    var filOT   = rotVal('rot-fil-ot').toLowerCase();
    var filPlaca= rotVal('rot-fil-placa').toUpperCase();
    var filMes  = rotVal('rot-fil-mes');        // 'YYYY-MM'
    var filDesde= rotVal('rot-fil-desde');       // 'YYYY-MM-DD'
    var filHasta= rotVal('rot-fil-hasta');
    var filEst  = window._rotFiltroEstado || rotVal('rot-fil-estado') || '';

    var resultado = window.rotData.filter(function(ot) {
        var det = rotDetalles(ot);
        var rawFecha = ot.fecha_ingreso || ot.creado_en || ot.created_at || (det ? (det.fecha_ingreso || det.fecha) : '');
        var fechaOT = rotFechaISO(rawFecha);

        // Búsqueda libre (N° OT, técnico, supervisor, placa)
        if (libre) {
            var hayText =
                (String(ot.ticket_entrada || ot.id_ot || '')).toLowerCase().indexOf(libre) !== -1 ||
                (ot.tecnico    || '').toLowerCase().indexOf(libre) !== -1 ||
                (ot.supervisor || '').toLowerCase().indexOf(libre) !== -1 ||
                (ot.placa      || '').toLowerCase().indexOf(libre) !== -1 ||
                (ot.situacion  || '').toLowerCase().indexOf(libre) !== -1 ||
                (det.tipo_ot   || '').toLowerCase().indexOf(libre) !== -1 ||
                (det.sub_tipo  || '').toLowerCase().indexOf(libre) !== -1;
            if (!hayText) return false;
        }
        // Filtro N° OT
        if (filOT && String(ot.ticket_entrada || ot.id_ot || '').toLowerCase().indexOf(filOT) === -1) return false;
        // Filtro placa
        if (filPlaca && (ot.placa || '').toUpperCase().indexOf(filPlaca) === -1) return false;

        // Filtro fecha (mes / desde / hasta)
        if (filMes || filDesde || filHasta) {
            if (!fechaOT) return false;
            if (filMes && fechaOT.slice(0, 7) !== filMes) return false;
            if (filDesde && fechaOT < filDesde) return false;
            if (filHasta && fechaOT > filHasta) return false;
        }
        
        // Filtro estado / tipo OT
        if (filEst) {
            var estOT = ot.estado || 'Pendiente';
            var tipoOT = (det.tipo_ot || ot.tipo || '').toUpperCase();

            if (filEst === 'Correctivo') {
                if (!tipoOT.includes('CORRECTIVO')) return false;
            } else if (filEst === 'Preventivo') {
                if (!tipoOT.includes('PREVENTIVO')) return false;
            } else if (filEst === 'Pendiente') {
                if (estOT !== 'Pendiente' && ['En Proceso', 'Pausada', 'Finalizado', 'Cerrada', 'Anulado'].includes(estOT)) return false;
            } else if (filEst === 'En Proceso') {
                if (estOT !== 'En Proceso' && estOT !== 'Pausada') return false;
            } else if (filEst === 'Pausada') {
                if (estOT !== 'Pausada') return false;
            } else if (filEst === 'Finalizado' || filEst === 'Finalizadas' || filEst === 'Cerrada') {
                if (estOT !== 'Finalizado' && estOT !== 'Cerrada' && ot.aprobacion !== 'Cerrada') return false;
            } else if (filEst === 'Anulado') {
                if (estOT !== 'Anulado') return false;
            } else {
                var target = filEst.toLowerCase();
                var matchEst = (estOT.toLowerCase() === target) || ((ot.aprobacion || '').toLowerCase() === target);
                if (!matchEst) return false;
            }
        }
        return true;
    });

    resultado.sort(function(a, b) {
        var numA = String(a.ticket_entrada || a.id_ot || '').toLowerCase();
        var numB = String(b.ticket_entrada || b.id_ot || '').toLowerCase();
        if (numA < numB) return 1;
        if (numA > numB) return -1;
        return 0;
    });

    window.rotDatosFiltrados = resultado;
    rotActualizarKPIs(resultado);
    window.rotRenderTabla(resultado);
};

// ── Permiso edición OT (lectura directa, sin depender de checkPerm global) ───
function rotPuedeEditar() {
    if (typeof window.checkPerm === 'function') {
        return window.checkPerm('ot', 'e') || window.checkPerm('reportes_ot', 'e');
    }
    try {
        var p = JSON.parse(localStorage.getItem('fleet_permisos') || '{}');
        if (p.admin === true) return true;
        var r = p.reportes_ot || p.ot || {};
        return !!(r.e === 1 || r.e === true);
    } catch(e) { return false; }
}

// ── Botones de acción modernos por estado ─────────────────────────
function rotBotonesAccion(ot) {
    var idOT   = rotEscHtml(String(ot.ticket_entrada || ot.id_ot || ''));
    var estado = ot.estado || 'Pendiente';
    if (!rotPuedeEditar()) return '';

    var b = function(cls, icon, txt, accion) {
        return '<button type="button" class="rot-btn ' + cls + '" onclick="event.stopPropagation();window.rotAccion(\'' + accion + '\',\'' + idOT + '\')">'
             + '<i class="bi ' + icon + '"></i><span>' + txt + '</span></button>';
    };

    var html = '<div class="rot-actions-container">';
    if (estado === 'Pendiente' || (!['En Proceso','Pausada','Finalizado','Cerrada','Anulado'].includes(estado))) {
        html += b('rot-btn-iniciar', 'bi-play-fill', 'Iniciar', 'iniciar');
    } else if (estado === 'En Proceso') {
        html += b('rot-btn-pausar',  'bi-pause-fill', 'Pausar', 'pausar')
              + b('rot-btn-cerrar',  'bi-lock-fill',  'Cerrar', 'cerrar');
    } else if (estado === 'Pausada') {
        html += b('rot-btn-reanudar', 'bi-play-fill', 'Reanudar', 'reanudar')
              + b('rot-btn-cerrar',   'bi-lock-fill', 'Cerrar',   'cerrar');
    } else if (estado === 'Finalizado' || estado === 'Cerrada') {
        html += '<span class="rot-badge rot-b-finalizado"><i class="bi bi-check-circle-fill"></i>Finalizado</span>';
    } else if (estado === 'Anulado') {
        html += '<span class="rot-badge rot-b-anulado"><i class="bi bi-x-circle-fill"></i>Anulado</span>';
    }
    html += '</div>';
    return html;
}

function rotBadgeEstado(estado) {
    var map = {
        'Pendiente':  ['rot-b-pendiente',  'Pendiente'],
        'En Proceso': ['rot-b-en-proceso', 'En Proceso'],
        'Pausada':    ['rot-b-pausada',    'Pausada'],
        'Finalizado': ['rot-b-finalizado', 'Finalizado'],
        'Cerrada':    ['rot-b-finalizado', 'Cerrada'],
        'Aprobada':   ['rot-b-aprobada',   'Aprobada'],
        'Anulado':    ['rot-b-anulado',    'Anulado']
    };
    var e = estado || 'Pendiente';
    var v = map[e] || ['rot-b-pendiente', e];
    return '<span class="rot-badge ' + v[0] + '">' + v[1] + '</span>';
}

// ── Cálculo de tiempos de OT ──────────────────────────────────────
function rotFmtDuracion(ms) {
    if (!ms || ms <= 0) return '0 min';
    var mins = Math.floor(ms / 60000);
    var hrs  = Math.floor(mins / 60);
    var m    = mins % 60;
    if (hrs === 0) return m + ' min';
    return hrs + 'h ' + (m > 0 ? m + 'min' : '');
}

function rotCalcularTiempos(ot) {
    var pIso = function(s) { return typeof s === 'string' ? s.replace('Z','') : s; };
    var inicio = ot.fecha_inicio_ot    ? new Date(pIso(ot.fecha_inicio_ot))    : null;
    var fin    = ot.fecha_hora_salida  ? new Date(pIso(ot.fecha_hora_salida))  : null;
    var pausas = [];
    for (var i = 1; i <= 3; i++) {
        if (ot['fecha_pausa' + i]) {
            pausas.push({
                inicio: new Date(pIso(ot['fecha_pausa' + i])),
                fin:    ot['fecha_fin_pausa' + i] ? new Date(pIso(ot['fecha_fin_pausa' + i])) : null,
                motivo: ot['motivo_pausa' + i] || ''
            });
        }
    }
    var ahora = new Date();
    var finCalc = fin || ((ot.estado === 'En Proceso' || ot.estado === 'Pausada') ? ahora : null);
    var totalMs = (inicio && finCalc) ? Math.max(0, finCalc - inicio) : 0;
    var tiempoMuertoMs = pausas.reduce(function(acc, p) {
        var fp = p.fin || (ot.estado === 'Pausada' && !p.fin ? ahora : null);
        return fp ? acc + Math.max(0, fp - p.inicio) : acc;
    }, 0);
    return {
        inicio: inicio, fin: fin,
        pausas: pausas,
        totalMs: totalMs,
        tiempoMuertoMs: tiempoMuertoMs,
        tiempoTrabajadoMs: Math.max(0, totalMs - tiempoMuertoMs)
    };
}

function rotCleanObsText(text) {
    if (!text) return '';
    return String(text)
        .replace(/^\[Reporte\s+[^\]]+\]\s*/gim, '')
        .replace(/^OT\s+OT-[^:]+:\s*/gim, '')
        .replace(/(?:^|\n)\s*(?:\d+[\.\)\-]?\s*)?(?:FALLA\s*MANUAL|MANUAL)\s*:\s*/gim, function(match) {
            return match.startsWith('\n') ? '\n' : '';
        })
        .replace(/^(?:FALLA\s*MANUAL|MANUAL)\s*:\s*/gim, '')
        .trim();
}

function rotFmtKmCol(det) {
    if (!det) return '0 km';
    if (det.horas_motor) {
        var numH = Number(det.horas_motor);
        return (!isNaN(numH) ? numH.toLocaleString('es-PE') : det.horas_motor) + ' hrs';
    }
    var kmVal = det.km !== undefined && det.km !== null ? det.km : (det.km_tablero !== undefined ? det.km_tablero : null);
    if (kmVal === null || kmVal === '' || kmVal === undefined) return '0 km';
    var num = Number(kmVal);
    if (isNaN(num)) return rotEscHtml(String(kmVal));
    return num.toLocaleString('es-PE') + ' km';
}

// ── Render tabla ─────────────────────────────────────────────────
window.rotRenderTabla = function(lista) {
    var tbody = document.getElementById('rot-tbody');
    var mobileList = document.getElementById('otListMobile');
    
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="td-empty">No hay resultados con los filtros aplicados.</td></tr>';
        if(mobileList) mobileList.innerHTML = '<div style="text-align:center; padding: 40px 20px; color: #94a3b8; font-size: 13px;"><i class="bi bi-inbox" style="font-size: 32px; display: block; margin-bottom: 12px; color: #cbd5e1;"></i> No se encontraron OTs</div>';
        return;
    }

    var html = '';
    var mobileHtml = '';
    lista.forEach(function(ot) {
        var idOT = ot.ticket_entrada || ot.id_ot || '—';
        var det = rotDetalles(ot);
        var subTipo = det.sub_tipo || det.subtipo_ot || '—';
        var esActiva = (window.rotDetalleId === idOT);
        var rId = det.rampa_origen || det.rampa || det.situacion_inicial || ot.id_rampa || '';
        var rObj = (window._rotCatRampas || []).find(function(x) { return x.id == rId; });
        var rName = rObj ? (rObj.descripcion || rObj.nombre_rampa || rObj.nombre || rId) : (rId ? 'Rampa ' + rId : '—');
        var tecsStr = det.tecnicos ? (Array.isArray(det.tecnicos) ? det.tecnicos.join(', ') : det.tecnicos) : (det.tecnicos_str || det.tecnico_lider || '—');

        var rawObs = rotCleanObsText(det.motivo || ot.observaciones || '');

        html += '<tr class="' + (esActiva ? 'rot-tr-activa' : '') + '" data-id="' + rotEscHtml(idOT) + '" onclick="window.rotAbrirDetalle(\'' + rotEscHtml(idOT) + '\')">'
              + '<td onclick="event.stopPropagation();" style="white-space:nowrap;padding:8px 10px;">' + rotBotonesAccion(ot) + '</td>'
              + '<td style="font-weight:700;color:var(--primary,#2563eb);white-space:nowrap;">' + rotEscHtml(idOT) + '</td>'
              + '<td style="font-size:0.78rem; color:var(--subtext); white-space:nowrap; font-weight:600;">' + rotFmtFecha(ot.fecha_ingreso || ot.creado_en) + '</td>'
              + '<td style="font-weight:700;"><span class="badge bg-light border text-dark fw-bold px-2 py-1">' + rotEscHtml(ot.placa || '—') + '</span></td>'
              + '<td style="font-size:0.84rem; font-weight:600;">' + rotFmtKmCol(det) + '</td>'
              + '<td style="white-space:nowrap;"><span class="badge rounded-pill fw-bold text-uppercase" style="background:#e0e7ff; color:#3730a3; border:1px solid #c7d2fe; font-size:0.68rem; padding:2px 8px;">' + rotEscHtml(det.tipo_ot || ot.tipo || '—') + (subTipo !== '—' ? ' • ' + rotEscHtml(subTipo) : '') + '</span></td>'
              + '<td style="font-size:0.8rem; font-weight:600; text-transform:uppercase; white-space:nowrap;">' + rotEscHtml(det.supervisor || ot.supervisor || '—') + '</td>'
              + '<td style="white-space:nowrap;">' + rotBadgeSituacion(det.situacion || det.situacion_inicial || 'En Atención') + '</td>'
              + '<td style="font-size:0.78rem; color:var(--subtext); max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + rotEscHtml(rawObs) + '">' + rotEscHtml(rawObs || '—') + '</td>'
              + '<td style="font-weight:700; color:#16a34a; text-align:right;">S/ ' + parseFloat(ot.costo_total||0).toFixed(2) + '</td>'
              + '<td style="text-align:center;"><button class="btn btn-sm btn-light border shadow-2xs rounded-3" style="color:#2563eb; padding:3px 8px;" onclick="event.stopPropagation(); window.rotAbrirDetalle(\'' + rotEscHtml(idOT) + '\')"><i class="bi bi-eye-fill"></i></button></td>'
              + '</tr>';

        // Tarjeta móvil
        mobileHtml += '<div class="rot-mobile-card ' + (esActiva ? 'border-primary' : '') + '" onclick="window.rotAbrirDetalle(\'' + rotEscHtml(idOT) + '\')">'
                    + '<div class="d-flex justify-content-between align-items-center mb-2">'
                    + '  <span class="rot-mobile-card-title">' + rotEscHtml(idOT) + '</span>'
                    + '  <span>' + rotBadgeEstado(ot.estado) + '</span>'
                    + '</div>'
                    + '<div class="rot-mobile-card-row mb-1">'
                    + '  <span class="rot-mobile-card-label">Placa:</span>'
                    + '  <span class="rot-mobile-card-val fw-bold text-primary">' + rotEscHtml(ot.placa || '—') + '</span>'
                    + '</div>'
                    + '<div class="rot-mobile-card-row mb-1">'
                    + '  <span class="rot-mobile-card-label">Rampa:</span>'
                    + '  <span class="rot-mobile-card-val">' + rotEscHtml(rName) + '</span>'
                    + '</div>'
                    + '<div class="rot-mobile-card-row mb-1">'
                    + '  <span class="rot-mobile-card-label">Tipo:</span>'
                    + '  <span class="rot-mobile-card-val">' + rotEscHtml(det.tipo_ot || ot.tipo || '—') + (subTipo !== '—' ? ' (' + rotEscHtml(subTipo) + ')' : '') + '</span>'
                    + '</div>'
                    + '<div class="rot-mobile-card-row mb-1">'
                    + '  <span class="rot-mobile-card-label">Supervisor:</span>'
                    + '  <span class="rot-mobile-card-val">' + rotEscHtml(det.supervisor || ot.supervisor || '—') + '</span>'
                    + '</div>'
                    + '<div class="rot-mobile-card-row mb-1">'
                    + '  <span class="rot-mobile-card-label">Técnicos:</span>'
                    + '  <span class="rot-mobile-card-val">' + rotEscHtml(tecsStr) + '</span>'
                    + '</div>'
                    + (rawObs ? '<div class="rot-mobile-card-row mt-2 pt-2 border-top"><span class="text-muted small text-truncate" style="max-width:100%">' + rotEscHtml(rawObs) + '</span></div>' : '')
                    + '</div>';
    });

    tbody.innerHTML = html;
    if (mobileList) mobileList.innerHTML = mobileHtml;
};

// ── Abrir drawer de detalle (MODERNO BENTO UI) ──────────────────────────────────────
window.rotAbrirDetalle = function(idOT) {
    if (!idOT) return;

    var doAbrir = function(ot) {
        if (!ot) {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('No se encontró la Orden de Trabajo', 'warning');
            return;
        }

        window.rotDetalleId = idOT;
        if (typeof window.registrarAperturaDrawer === 'function') window.registrarAperturaDrawer('rot-drawer-detalle');
        if (typeof window.rotRenderTabla === 'function' && document.getElementById('rot-tbody')) {
            window.rotRenderTabla(window.rotDatosFiltrados);
        }

        var det    = rotDetalles(ot);
        var estado = ot.estado || 'Pendiente';
        var esAprobada = (estado === 'Aprobada' || estado === 'En Proceso' || estado === 'Pausada' || estado === 'Finalizado' || estado === 'Cerrada');
        var puedeAgregarMaterial = esAprobada;
        var puedeEditar = typeof window.checkPerm === 'function' ? window.checkPerm('ot', 'e') : true;
        var puedeCrearInsp = puedeEditar || (typeof window.checkPerm === 'function' && window.checkPerm('insp', 'c'));

        function esc(s) { return rotEscHtml(String(s||'')); }

        var labelKm = det.horas_motor ? 'Horas Motor' : 'Kilometraje';
        var tipoOtStr = (det.tipo_ot || ot.tipo || 'Correctivo');
        var subTipoOtStr = (det.sub_tipo || '');
    var rId = det.rampa_origen || det.rampa || det.situacion_inicial || ot.id_rampa || '';
    var rObj = (window._rotCatRampas || []).find(function(x) { return x.id == rId; });
    var rName = rObj ? (rObj.descripcion || rObj.nombre_rampa || rObj.nombre || rId) : (rId ? 'Rampa ' + rId : 'Sin Rampa');
    var tecsStr = det.tecnicos ? (Array.isArray(det.tecnicos) ? det.tecnicos.join(', ') : det.tecnicos) : (det.tecnicos_str || det.tecnico_lider || '—');
    var tecsArray = [];
    if (det.tecnicos && Array.isArray(det.tecnicos)) {
        tecsArray = det.tecnicos;
    } else if (tecsStr && tecsStr !== '—') {
        tecsArray = tecsStr.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    }
    var t = rotCalcularTiempos(ot);

    var html = `
        <!-- Hero Card -->
        <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1.5px solid #e2e8f0 !important;">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
                <div class="d-flex align-items-center gap-3">
                    <div class="rounded-4 d-flex justify-content-center align-items-center fw-bold text-white shadow-sm" 
                         style="width: 54px; height: 54px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); font-size: 1.5rem; flex-shrink: 0;">
                        <i class="bi bi-file-earmark-ruled-fill text-white"></i>
                    </div>
                    <div>
                        <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
                            <h4 class="m-0 fw-bold text-dark" style="letter-spacing: 0.5px; font-size: 1.35rem;">
                                ${esc(idOT)}
                            </h4>
                            <span class="badge rounded-pill fw-bold text-uppercase" style="background:#e0e7ff; color:#3730a3; border:1px solid #c7d2fe; font-size:0.72rem; padding:3px 9px;">
                                ${esc(tipoOtStr)}${subTipoOtStr ? ' • ' + esc(subTipoOtStr) : ''}
                            </span>
                            ${rotBadgeEstado(estado)}
                        </div>
                        <div class="d-flex align-items-center gap-2 text-muted small fw-semibold">
                            <span><i class="bi bi-truck text-secondary me-1"></i><strong class="text-dark">${esc(ot.placa || '—')}</strong></span>
                            <span>•</span>
                            <span><i class="bi bi-geo-alt-fill text-danger me-1"></i>${esc(rName)}</span>
                            <span>•</span>
                            <span class="badge bg-light text-secondary border fw-bold" style="font-size: 0.68rem;">${rotFmtFecha(ot.fecha_ingreso || ot.creado_en)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Bento Grid Metrics (4 Columnas) -->
        <div class="row g-2 mb-3">
            <div class="col-6 col-md-3">
                <div class="card border-0 rounded-4 p-2 bg-white shadow-2xs h-100" style="border: 1px solid #e2e8f0 !important;">
                    <div class="d-flex align-items-center justify-content-between mb-1">
                        <div class="d-flex align-items-center gap-1">
                            <div class="rounded-3 p-1 bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center" style="width:24px; height:24px;">
                                <i class="bi bi-speedometer2" style="font-size:0.8rem;"></i>
                            </div>
                            <span class="text-muted fw-bold" style="font-size: 0.65rem; text-transform: uppercase;">${labelKm}</span>
                        </div>
                        ${puedeEditar ? `<button class="btn btn-sm btn-light border-0 p-0 text-primary" onclick="window.rotEditarKm('${esc(idOT)}', ${det.km || det.horas_motor || 0})" title="Editar"><i class="bi bi-pencil-square"></i></button>` : ''}
                    </div>
                    <div class="fw-bold text-dark text-truncate" style="font-size: 0.85rem;" id="rot-ot-km-txt">
                        ${rotFmtKmCol(det)}
                    </div>
                </div>
            </div>
            <div class="col-6 col-md-3">
                <div class="card border-0 rounded-4 p-2 bg-white shadow-2xs h-100" style="border: 1px solid #e2e8f0 !important;">
                    <div class="d-flex align-items-center gap-1 mb-1">
                        <div class="rounded-3 p-1 text-purple d-flex align-items-center justify-content-center" style="width:24px; height:24px; background: rgba(124, 58, 237, 0.1); color: #7c3aed;">
                            <i class="bi bi-person-badge-fill" style="font-size:0.8rem;"></i>
                        </div>
                        <span class="text-muted fw-bold" style="font-size: 0.65rem; text-transform: uppercase;">Supervisor</span>
                    </div>
                    <div class="fw-bold text-dark text-truncate text-uppercase" style="font-size: 0.82rem;" title="${esc(det.supervisor || ot.supervisor || '—')}">
                        ${esc(det.supervisor || ot.supervisor || 'Sin asignar')}
                    </div>
                </div>
            </div>
            <div class="col-6 col-md-3">
                <div class="card border-0 rounded-4 p-2 bg-white shadow-2xs h-100 d-flex flex-column justify-content-between" style="border: 1px solid #e2e8f0 !important;">
                    <div class="d-flex align-items-center justify-content-between mb-1">
                        <div class="d-flex align-items-center gap-1">
                            <div class="rounded-3 p-1 bg-info bg-opacity-10 text-info d-flex align-items-center justify-content-center" style="width:24px; height:24px;">
                                <i class="bi bi-people-fill" style="font-size:0.8rem;"></i>
                            </div>
                            <span class="text-muted fw-bold" style="font-size: 0.65rem; text-transform: uppercase;">Técnicos</span>
                        </div>
                        ${tecsArray.length > 1 ? `<span class="badge bg-info bg-opacity-10 text-info rounded-pill px-1" style="font-size:0.65rem;">${tecsArray.length}</span>` : ''}
                    </div>
                    <div class="d-flex flex-wrap gap-1 mt-1">
                        ${tecsArray.length ? tecsArray.map(function(tName){
                            return `<span class="badge bg-light text-dark border fw-bold text-uppercase" style="font-size:0.68rem; padding: 2px 6px; white-space: normal; text-align: left; line-height: 1.2;">
                                <i class="bi bi-person-fill text-secondary me-1"></i>${esc(tName)}
                            </span>`;
                        }).join('') : '<span class="text-muted small">Sin asignar</span>'}
                    </div>
                </div>
            </div>
            <div class="col-6 col-md-3">
                <div class="card border-0 rounded-4 p-2 bg-white shadow-2xs h-100" style="border: 1px solid #e2e8f0 !important;">
                    <div class="d-flex align-items-center gap-1 mb-1">
                        <div class="rounded-3 p-1 bg-success bg-opacity-10 text-success d-flex align-items-center justify-content-center" style="width:24px; height:24px;">
                            <i class="bi bi-cash-stack" style="font-size:0.8rem;"></i>
                        </div>
                        <span class="text-muted fw-bold" style="font-size: 0.65rem; text-transform: uppercase;">Costo Total</span>
                    </div>
                    <div class="fw-bold text-success text-truncate" style="font-size: 0.88rem;" id="rot-ot-costo-total">
                        S/ ${parseFloat(ot.costo_total||0).toFixed(2)}
                    </div>
                </div>
            </div>
        </div>

        <!-- Cronología y Tiempos de Servicio -->
        <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important;">
            <div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
                <h6 class="m-0 fw-bold text-dark d-flex align-items-center gap-2" style="font-size: 0.88rem; text-transform: uppercase; letter-spacing: 0.04em;">
                    <i class="bi bi-clock-history text-primary"></i> Tiempos y Ciclo de Orden
                </h6>
                ${t.inicio ? `
                    <div class="d-flex gap-2">
                        <span class="badge rounded-pill fw-bold" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; font-size:0.72rem;">
                            <i class="bi bi-play-fill me-1"></i>Trabajado: ${rotFmtDuracion(t.tiempoTrabajadoMs)}
                        </span>
                        <span class="badge rounded-pill fw-bold" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; font-size:0.72rem;">
                            <i class="bi bi-pause-fill me-1"></i>T. Muerto: ${rotFmtDuracion(t.tiempoMuertoMs)}
                        </span>
                    </div>
                ` : ''}
            </div>

            <div class="position-relative ps-2">
                <div style="position:absolute; left:21px; top:20px; bottom:20px; width:2px; background:#e2e8f0; z-index:1;"></div>
                
                <div class="d-flex align-items-start gap-3 position-relative mb-3" style="z-index:2;">
                    <div class="rounded-circle d-flex justify-content-center align-items-center text-white shadow-2xs" 
                         style="width:28px; height:28px; background:#10b981; flex-shrink:0;">
                        <i class="bi bi-box-arrow-in-right" style="font-size: 0.85rem;"></i>
                    </div>
                    <div class="flex-grow-1">
                        <div class="fw-bold text-muted" style="font-size: 0.68rem; text-transform: uppercase;">Ingreso a Taller</div>
                        <div class="fw-bold text-dark" style="font-size: 0.88rem;">${rotFmtFecha(ot.fecha_ingreso || ot.creado_en)}</div>
                    </div>
                </div>

                <div class="d-flex align-items-start gap-3 position-relative mb-3" style="z-index:2;">
                    <div class="rounded-circle d-flex justify-content-center align-items-center text-white shadow-2xs" 
                         style="width:28px; height:28px; background:#3b82f6; flex-shrink:0;">
                        <i class="bi bi-play-circle-fill" style="font-size: 0.85rem;"></i>
                    </div>
                    <div class="flex-grow-1">
                        <div class="fw-bold text-muted" style="font-size: 0.68rem; text-transform: uppercase;">Inicio de Trabajos</div>
                        <div class="fw-bold text-dark" style="font-size: 0.88rem;">
                            ${t.inicio ? rotFmtFechaHora(t.inicio) + (ot.iniciado_por ? `<span class="text-muted fw-normal small ms-1">(por ${esc(rotGetNombreUsuario(ot.iniciado_por))})</span>` : '') : '<span class="text-muted fw-normal">Aún no iniciado</span>'}
                        </div>
                    </div>
                </div>

                <div class="d-flex align-items-start gap-3 position-relative" style="z-index:2;">
                    <div class="rounded-circle d-flex justify-content-center align-items-center text-white shadow-2xs" 
                         style="width:28px; height:28px; background:#6366f1; flex-shrink:0;">
                        <i class="bi bi-lock-fill" style="font-size: 0.85rem;"></i>
                    </div>
                    <div class="flex-grow-1">
                        <div class="fw-bold text-muted" style="font-size: 0.68rem; text-transform: uppercase;">Cierre de OT</div>
                        <div class="fw-bold text-dark" style="font-size: 0.88rem;">
                            ${t.fin ? rotFmtFechaHora(t.fin) + (ot.cerrado_por ? `<span class="text-muted fw-normal small ms-1">(por ${esc(rotGetNombreUsuario(ot.cerrado_por))})</span>` : '') : '<span class="text-muted fw-normal">En proceso / Abierta</span>'}
                        </div>
                    </div>
                </div>
            </div>

            ${t.pausas.length > 0 ? `
                <div class="mt-3 pt-2 border-top">
                    <div style="font-size:0.68rem; font-weight:800; color:var(--subtext); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">Registro de Pausas</div>
                    ${t.pausas.map(function(p) {
                        var dur = p.fin ? rotFmtDuracion(p.fin - p.inicio) : 'En curso';
                        return `
                            <div class="p-2 mb-1 rounded-3 bg-light border-start border-warning border-3" style="font-size: 0.78rem;">
                                <div class="d-flex align-items-center justify-content-between">
                                    <span class="fw-bold text-dark">${rotFmtFechaHora(p.inicio)} → ${p.fin ? rotFmtFechaHora(p.fin) : 'Sin reanudar'}</span>
                                    <span class="badge bg-warning bg-opacity-25 text-dark fw-bold">${dur}</span>
                                </div>
                                ${p.motivo ? `<div class="text-muted mt-1 small"><i class="bi bi-chat-left-text me-1"></i>${esc(p.motivo)}</div>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}

            ${ot.comentario_cierre ? `
                <div class="mt-3 p-2 rounded-3 bg-light border" style="font-size: 0.8rem;">
                    <div class="fw-bold text-muted small text-uppercase">Comentario de Cierre:</div>
                    <div class="text-dark fst-italic mt-1">${esc(ot.comentario_cierre)}</div>
                </div>
            ` : ''}
        </div>

        <!-- Motivo / Observaciones -->
        ${(det.motivo || ot.observaciones) ? `
            <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important;">
                <h6 class="m-0 fw-bold text-dark mb-2 pb-1 border-bottom d-flex align-items-center gap-2" style="font-size: 0.88rem; text-transform: uppercase; letter-spacing: 0.04em;">
                    <i class="bi bi-card-text text-primary"></i> Motivo y Observaciones Iniciales
                </h6>
                <div class="p-2 rounded-3 bg-light border fw-semibold text-dark text-uppercase" style="font-size: 0.82rem; white-space: pre-line; line-height: 1.5;">
                    ${esc(rotCleanObsText(det.motivo || ot.observaciones || ''))}
                </div>
            </div>
        ` : ''}

        <!-- Plantillas Rápidas (Bento 3 Columnas) -->
        <div class="row g-2 mb-3">
            <div class="col-4">
                <div class="card border-0 rounded-4 p-2 bg-white shadow-2xs h-100 d-flex flex-row align-items-center gap-2" 
                     style="border: 1px solid #e2e8f0 !important; cursor: pointer; transition: all 0.2s;"
                     onclick="event.stopPropagation(); window.descargarPlantillaVaciaOT('${rotEscHtml(idOT)}', '${rotEscHtml(ot.placa)}', '${rotEscHtml(ot.fecha_inicio_ot || ot.fecha_ingreso || ot.creado_en || '')}', '${(det.km||'')}', '${rotEscHtml(det.rampa_origen||'')}')">
                    <div class="rounded-3 p-2 bg-success bg-opacity-10 text-success d-flex align-items-center justify-content-center flex-shrink-0" style="width:34px; height:34px;">
                        <i class="bi bi-card-checklist fs-5"></i>
                    </div>
                    <div>
                        <div class="fw-bold text-dark small" style="line-height:1.2; font-size:0.76rem;">Plantilla Inspecciones</div>
                        <small class="text-muted" style="font-size:0.64rem;">F-MAN-001</small>
                    </div>
                </div>
            </div>
            <div class="col-4">
                <div class="card border-0 rounded-4 p-2 bg-white shadow-2xs h-100 d-flex flex-row align-items-center gap-2" 
                     style="border: 1px solid #e2e8f0 !important; cursor: pointer; transition: all 0.2s;"
                     onclick="event.stopPropagation(); window.rotDescargarPlantillaOT('${rotEscHtml(idOT)}', '${rotEscHtml(ot.placa)}');">
                    <div class="rounded-3 p-2 bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center flex-shrink-0" style="width:34px; height:34px;">
                        <i class="bi bi-file-earmark-pdf fs-5"></i>
                    </div>
                    <div>
                        <div class="fw-bold text-dark small" style="line-height:1.2; font-size:0.76rem;">Plantilla OT</div>
                        <small class="text-muted" style="font-size:0.64rem;">Impresión Rápida</small>
                    </div>
                </div>
            </div>
            <div class="col-4">
                <div class="card border-0 rounded-4 p-2 bg-white shadow-2xs h-100 d-flex flex-row align-items-center gap-2" 
                     style="border: 1px solid #e2e8f0 !important; cursor: pointer; transition: all 0.2s;"
                     onclick="event.stopPropagation(); window.rotGenerarPlantillaLlantasOT('${rotEscHtml(idOT)}');"
                     title="Generar Plantilla de Llantas A4 en Blanco">
                    <div class="rounded-3 p-2 bg-warning bg-opacity-10 text-warning d-flex align-items-center justify-content-center flex-shrink-0" style="width:34px; height:34px;">
                        <i class="bi bi-disc fs-5"></i>
                    </div>
                    <div>
                        <div class="fw-bold text-dark small" style="line-height:1.2; font-size:0.76rem;">Plantilla de Llantas</div>
                        <small class="text-muted" style="font-size:0.64rem;">Formato A4 Blanco</small>
                    </div>
                </div>
            </div>
        </div>

        <!-- Trabajos -->
        <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" id="rot-sec-trabajos" style="border: 1px solid #e2e8f0 !important;">
            <div class="d-flex align-items-center justify-content-between mb-2 pb-1 border-bottom">
                <div class="d-flex align-items-center gap-2">
                    <h6 class="m-0 fw-bold text-dark d-flex align-items-center gap-2" style="font-size: 0.88rem; text-transform: uppercase; letter-spacing: 0.04em;">
                        <i class="bi bi-tools text-primary"></i> Trabajos Realizados
                    </h6>
                    <span class="badge bg-primary bg-opacity-10 text-primary fw-bold rounded-pill px-2 py-1" id="rot-tr-count" style="font-size: 0.7rem;">0</span>
                </div>
                ${esAprobada ? `<button class="btn btn-sm btn-outline-primary fw-bold rounded-pill px-3 py-1" style="font-size: 0.72rem;" onclick="event.stopPropagation();window.rotAgregarTrabajo('${rotEscHtml(idOT)}')"><i class="bi bi-plus-lg me-1"></i>Agregar</button>` : ''}
            </div>
            <div id="rot-tr-body"><div class="p-3 text-center text-muted small"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>
        </div>

        <!-- Salidas de Almacén (Materiales) -->
        <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" id="rot-sec-materiales" style="border: 1px solid #e2e8f0 !important;">
            <div class="d-flex align-items-center justify-content-between mb-2 pb-1 border-bottom">
                <div class="d-flex align-items-center gap-2">
                    <h6 class="m-0 fw-bold text-dark d-flex align-items-center gap-2" style="font-size: 0.88rem; text-transform: uppercase; letter-spacing: 0.04em;">
                        <i class="bi bi-box-seam text-success"></i> Salidas de Almacén (Repuestos)
                    </h6>
                    <span class="badge bg-success bg-opacity-10 text-success fw-bold rounded-pill px-2 py-1" id="rot-mat-count" style="font-size: 0.7rem;">0</span>
                </div>
                ${esAprobada ? `<button class="btn btn-sm btn-outline-success fw-bold rounded-pill px-3 py-1" style="font-size: 0.72rem;" onclick="event.stopPropagation();window.rotAgregarSalida('${rotEscHtml(idOT)}')"><i class="bi bi-plus-lg me-1"></i>Agregar</button>` : ''}
            </div>
            <div id="rot-mat-body"><div class="p-3 text-center text-muted small"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>
        </div>

        <!-- Servicios de Terceros -->
        <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" id="rot-sec-servicios" style="border: 1px solid #e2e8f0 !important;">
            <div class="d-flex align-items-center justify-content-between mb-2 pb-1 border-bottom">
                <div class="d-flex align-items-center gap-2">
                    <h6 class="m-0 fw-bold text-dark d-flex align-items-center gap-2" style="font-size: 0.88rem; text-transform: uppercase; letter-spacing: 0.04em;">
                        <i class="bi bi-gear-wide-connected text-info"></i> Servicios de Terceros
                    </h6>
                    <span class="badge bg-info bg-opacity-10 text-info fw-bold rounded-pill px-2 py-1" id="rot-srv-count" style="font-size: 0.7rem;">0</span>
                </div>
            </div>
            <div id="rot-srv-body"><div class="p-3 text-center text-muted small"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>
        </div>

        <!-- Inspección General -->
        <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" id="rot-sec-inspecciones" style="border: 1px solid #e2e8f0 !important;">
            <div class="d-flex align-items-center justify-content-between mb-2 pb-1 border-bottom">
                <div class="d-flex align-items-center gap-2">
                    <h6 class="m-0 fw-bold text-dark d-flex align-items-center gap-2" style="font-size: 0.88rem; text-transform: uppercase; letter-spacing: 0.04em;">
                        <i class="bi bi-clipboard2-check-fill text-purple" style="color:#7c3aed;"></i> Inspección General
                    </h6>
                </div>
                ${puedeCrearInsp ? `<button class="btn btn-sm fw-bold rounded-pill px-3 py-1" style="font-size:0.72rem; background:rgba(124,58,237,0.1); color:#7c3aed; border:1px solid rgba(124,58,237,0.2);" onclick="event.stopPropagation();window.rotAbrirInspeccionWrapper('${esc(ot.placa)}', '${esc(idOT)}', ${(det.km||0)})"><i class="bi bi-plus-lg me-1"></i>Agregar</button>` : ''}
            </div>
            <div id="rot-insp-body"><div class="p-3 text-center text-muted small"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>
        </div>

        <!-- Inspección de Neumáticos -->
        <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" id="rot-sec-neumaticos" style="border: 1px solid #e2e8f0 !important;">
            <div class="d-flex align-items-center justify-content-between mb-2 pb-1 border-bottom">
                <div class="d-flex align-items-center gap-2">
                    <h6 class="m-0 fw-bold text-dark d-flex align-items-center gap-2" style="font-size: 0.88rem; text-transform: uppercase; letter-spacing: 0.04em;">
                        <i class="bi bi-disc-fill text-primary" style="color:#2563eb;"></i> Inspección de Neumáticos
                    </h6>
                    <span class="badge bg-primary bg-opacity-10 text-primary fw-bold rounded-pill px-2 py-1" id="rot-neu-count" style="font-size: 0.7rem;">0</span>
                </div>
                <button class="btn btn-sm btn-outline-primary fw-bold rounded-pill px-3 py-1" style="font-size:0.72rem;" onclick="event.stopPropagation();window.rotAbrirInspeccionNeumaticosWrapper('${esc(ot.placa)}', '${esc(idOT)}', ${(det.km||0)})"><i class="bi bi-plus-lg me-1"></i>Agregar</button>
            </div>
            <div id="rot-neu-body">
                <div class="p-3 text-center text-muted small"><div class="spinner-border spinner-border-sm text-secondary"></div></div>
            </div>
        </div>

        <!-- Backlog Pendiente -->
        ${ot.placa ? `
            <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" id="rot-sec-backlog" style="border: 1px solid #e2e8f0 !important;">
                <div class="d-flex align-items-center justify-content-between mb-2 pb-1 border-bottom">
                    <div class="d-flex align-items-center gap-2">
                        <h6 class="m-0 fw-bold text-dark d-flex align-items-center gap-2" style="font-size: 0.88rem; text-transform: uppercase; letter-spacing: 0.04em;">
                            <i class="bi bi-exclamation-triangle-fill text-warning"></i> Mantenimientos Pendientes (Backlog)
                        </h6>
                        <span class="badge bg-warning bg-opacity-10 text-warning fw-bold rounded-pill px-2 py-1" id="rot-bkg-count" style="font-size: 0.7rem;">…</span>
                    </div>
                    ${esAprobada ? `<button class="btn btn-sm btn-outline-warning fw-bold rounded-pill px-3 py-1" style="font-size:0.72rem;" onclick="event.stopPropagation();window.rotAbrirAgregarBacklog('${rotEscHtml(ot.placa)}', '${rotEscHtml(idOT)}', ${(det.km||0)})"><i class="bi bi-plus-lg me-1"></i>Agregar</button>` : ''}
                </div>
                <div id="rot-bkg-body"><div class="p-3 text-center text-muted small"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>
            </div>
        ` : ''}
    `;

    var body   = document.getElementById('rot-drawer-body');
    var footer = document.getElementById('rot-drawer-footer');
    var back   = document.getElementById('rotDrawerBackdrop');
    var drawer = document.getElementById('rot-drawer-detalle');
    if (!body || !footer || !drawer) return;

    body.innerHTML = html;

    // Footer Bento
    var puedeEliminar = window.checkPerm('ot', 'd');
    var ftHtml = `
        <div class="d-flex align-items-center justify-content-between w-100 flex-wrap gap-2">
            <div class="d-flex gap-2">
                ${puedeEliminar ? `
                    <button class="btn btn-outline-danger btn-sm rounded-3 px-3 py-2 fw-bold d-flex align-items-center gap-1 shadow-2xs" onclick="window.rotAccion('eliminar','${esc(idOT)}')">
                        <i class="bi bi-trash3-fill"></i> <span class="d-none d-sm-inline">Eliminar</span>
                    </button>
                ` : ''}
                ${puedeEditar ? `
                    <button class="btn btn-outline-secondary btn-sm rounded-3 px-3 py-2 fw-bold d-flex align-items-center gap-1 shadow-2xs" onclick="window.rotAccion('editar','${esc(idOT)}')">
                        <i class="bi bi-pencil-square"></i> <span class="d-none d-sm-inline">Editar OT</span>
                    </button>
                    <button class="btn btn-outline-info btn-sm rounded-3 px-3 py-2 fw-bold d-flex align-items-center gap-1 shadow-2xs" onclick="window.rotAbrirEditarFechas('${esc(idOT)}')">
                        <i class="bi bi-calendar3"></i> <span class="d-none d-sm-inline">Fechas</span>
                    </button>
                ` : ''}
                <button class="btn btn-outline-secondary btn-sm rounded-3 px-3 py-2 fw-bold d-flex align-items-center gap-1 shadow-2xs" onclick="window.rotAccion('pdf','${esc(idOT)}')">
                    <i class="bi bi-file-earmark-pdf-fill text-danger"></i> <span>PDF</span>
                </button>
            </div>

            <div class="d-flex gap-2 ms-auto">
    `;

    if (puedeEditar) {
        if (estado === 'Pendiente') {
            ftHtml += `
                <button class="btn btn-outline-danger btn-sm rounded-3 px-3 py-2 fw-bold" onclick="window.rotAccion('anular','${esc(idOT)}')">
                    <i class="bi bi-x-circle me-1"></i>Anular
                </button>
                <button class="btn btn-primary btn-sm rounded-3 px-4 py-2 fw-bold shadow-2xs" onclick="window.rotAccion('iniciar','${esc(idOT)}')">
                    <i class="bi bi-play-fill me-1"></i>Iniciar OT
                </button>
            `;
        } else if (estado === 'En Proceso') {
            ftHtml += `
                <button class="btn btn-warning btn-sm rounded-3 px-3 py-2 fw-bold" onclick="window.rotAccion('pausar','${esc(idOT)}')">
                    <i class="bi bi-pause-fill me-1"></i>Pausar
                </button>
                <button class="btn btn-danger text-white btn-sm rounded-3 px-4 py-2 fw-bold shadow-2xs" onclick="window.rotAccion('cerrar','${esc(idOT)}')">
                    <i class="bi bi-lock-fill me-1"></i>Cerrar OT
                </button>
            `;
        } else if (estado === 'Pausada') {
            ftHtml += `
                <button class="btn btn-success btn-sm rounded-3 px-3 py-2 fw-bold" onclick="window.rotAccion('reanudar','${esc(idOT)}')">
                    <i class="bi bi-play-fill me-1"></i>Reanudar
                </button>
                <button class="btn btn-danger text-white btn-sm rounded-3 px-4 py-2 fw-bold shadow-2xs" onclick="window.rotAccion('cerrar','${esc(idOT)}')">
                    <i class="bi bi-lock-fill me-1"></i>Cerrar OT
                </button>
            `;
        } else if (estado === 'Aprobada') {
            ftHtml += `
                <button class="btn btn-primary btn-sm rounded-3 px-4 py-2 fw-bold shadow-2xs" onclick="window.rotAccion('cerrar','${esc(idOT)}')">
                    <i class="bi bi-lock-fill me-1"></i>Cerrar OT
                </button>
            `;
        } else if (estado === 'Finalizado' || estado === 'Cerrada') {
            ftHtml += `
                <button class="btn btn-outline-success btn-sm rounded-3 px-3 py-2 fw-bold" onclick="window.rotAccion('reactivar','${esc(idOT)}')">
                    <i class="bi bi-arrow-counterclockwise me-1"></i>Reactivar OT
                </button>
            `;
        }
    }

    ftHtml += `
            </div>
        </div>
    `;
    footer.innerHTML = ftHtml;
    footer.style.display = 'flex';

    if (back) back.classList.add('open');
    drawer.classList.add('open');

    // Fetch trabajos + materiales + backlog + inspecciones + neumáticos en paralelo
    window.rotOtTrabajosActivos   = [];
    window.rotOtMaterialesActivos = [];
    window.rotOtInspeccionesActivas = [];
    window.rotOtNeumaticosActivos = [];

    Promise.all([
        fetch('/api/ot-trabajos?id_ot='       + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        ot.placa ? fetch('/api/ot-backlog?placa=' + encodeURIComponent(ot.placa)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }) : Promise.resolve([]),
        fetch('/api/inspecciones-por-ot?id_ot=' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        fetch('/api/almacen/entradas?ot_id=' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        fetch('/api/neumaticos/inspecciones?id_ot=' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : { ok:false, data:[] }; }).catch(function(){ return { ok:false, data:[] }; })
    ]).then(function(res) {
        window.rotOtTrabajosActivos   = Array.isArray(res[0]) ? res[0] : [];
        window.rotOtMaterialesActivos = Array.isArray(res[1]) ? res[1] : [];
        var backlogItems              = Array.isArray(res[2]) ? res[2] : [];
        window.rotOtInspeccionesActivas = Array.isArray(res[3]) ? res[3] : [];
        var servicios = Array.isArray(res[4]) ? res[4] : [];
        window.rotOtNeumaticosActivos = (res[5] && res[5].ok && Array.isArray(res[5].data)) ? res[5].data : (Array.isArray(res[5]) ? res[5] : []);

        servicios = servicios.filter(function(s) { return (s.tipo_orden||'').toLowerCase() === 'orden de servicio' && (s.estado || '').toLowerCase() !== 'anulado' && (s.estado || '').toLowerCase() !== 'anulada'; });
        var srvBody = document.getElementById('rot-srv-body');
        var srvCount = document.getElementById('rot-srv-count');
        if (srvCount) srvCount.textContent = servicios.length;
        if (srvBody) {
            if (!servicios.length) {
                srvBody.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;">No hay servicios de terceros registrados.</div>';
            } else {
                var sHTML = '';
                servicios.forEach(function(srv) {
                    var svcNames = (srv.items && srv.items.length > 0) ? srv.items.map(function(it) { return it.descripcion; }).join(', ') : 'Servicio sin descripción';
                    sHTML += '<div style="padding:10px 12px; border-bottom:1px solid var(--border); font-size:0.8rem;">' +
                             '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                                '<strong>' + rotEscHtml(svcNames) + '</strong>' +
                                '<span style="color:#16a34a; font-weight:bold;">S/ ' + Number(srv.total_pen || 0).toLocaleString('es-PE', {minimumFractionDigits:2}) + '</span>' +
                             '</div>' +
                             '</div>';
                });
                srvBody.innerHTML = sHTML;
            }
        }
        rotRenderSecTrabajos(idOT, esAprobada);
        rotRenderSecMateriales(idOT, puedeAgregarMaterial);
        rotRenderSecBacklog(backlogItems, idOT);
        rotRenderSecInspecciones(idOT);
        rotRenderSecNeumaticos(idOT);
        // Actualizar costo total dinámico
        var costoTr = window.rotOtTrabajosActivos
            .filter(function(t){ return t.estado === 'Aprobado'; })
            .reduce(function(s, t) {
                var d2 = {}; try { d2 = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); } catch(e) {}
                return s + parseFloat(d2.costo || 0);
            }, 0);
        var costoMat = window.rotOtMaterialesActivos
            .filter(function(m){ return m.estado === 'Despachado'; })
            .reduce(function(s, m){ return s + parseFloat(m.total_pen || 0); }, 0);
        var elCosto = document.getElementById('rot-ot-costo-total');
        if (elCosto) elCosto.textContent = 'S/' + (costoTr + costoMat).toFixed(2);
    });
    };

    var ot = (window.rotData || []).find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
    if (!ot && window.srOtData) {
        ot = (window.srOtData || []).find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
    }
    if (!ot) {
        fetch('/api/ordenes-trabajo')
            .then(function(r){ return r.json(); })
            .then(function(data) {
                window.rotData = Array.isArray(data) ? data : [];
                ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
                if (ot) doAbrir(ot);
                else if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('No se encontró la Orden de Trabajo', 'warning');
            })
            .catch(function(err){ 
                console.error('Error cargando OT para detalle:', err);
                if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error cargando la Orden de Trabajo', 'danger');
            });
        return;
    }
    doAbrir(ot);
};

// ── Cerrar drawer ─────────────────────────────────────────────────
window.rotCerrarDetalle = function() {
    ['rot-drawer-trabajo', 'rot-drawer-material', 'drawerInspeccion', 'rot-drawer-backlog', 'rot-drawer-editar-ot', 'rot-drawer-editar-fechas'].forEach(function(id) {
        var d = document.getElementById(id); if (d) d.classList.remove('open');
    });
    var back1  = document.getElementById('rotDrawerBackdrop');
    var drawer = document.getElementById('rot-drawer-detalle');
    if (back1)  back1.classList.remove('open');
    if (drawer) drawer.classList.remove('open');
    window.rotDetalleId = null;

    // Preservar backdrop de Status Rampa si el panel de rampa sigue abierto
    var srAbierto = document.querySelector('.sr-panel-detalle.open, .sr-drawer.open, #sr-panel-detalle.open, #sr-drawer-registro.open, [id^="sr-panel"].open');
    var srBack = document.getElementById('srDrawerBackdrop');
    if (srAbierto && srBack) {
        srBack.classList.add('open');
    }

    if (typeof window.rotRenderTabla === 'function' && document.getElementById('rot-tbody')) {
        window.rotRenderTabla(window.rotDatosFiltrados);
    }
};

// ── Modal de comentario (pausar / cerrar) ─────────────────────────
function rotModalComentario(titulo, placeholder, requerido, onConfirm) {
    var existente = document.getElementById('rot-modal-comentario');
    if (existente) existente.remove();

    var overlay = document.createElement('div');
    overlay.id = 'rot-modal-comentario';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);opacity:0;transition:opacity 0.2s ease;';

    overlay.innerHTML =
        '<div style="background:var(--surface,#fff);border-radius:16px;width:420px;max-width:94vw;box-shadow:0 10px 40px rgba(0,0,0,0.2);transform:scale(0.95);transition:transform 0.2s ease;overflow:hidden;">'
      + '<div style="padding:24px 24px 16px;">'
      + '<h5 style="margin:0 0 16px;font-weight:700;color:var(--text);text-align:center;">' + titulo + '</h5>'
      + '<textarea id="rot-mc-input" rows="4" class="form-control" style="border-radius:10px;font-size:0.9rem;resize:vertical;background:var(--bg,#f8f8f8);" placeholder="' + placeholder + '"></textarea>'
      + (requerido ? '<div id="rot-mc-err" style="display:none;color:#dc3545;font-size:0.75rem;margin-top:6px;text-align:center;">Este campo es obligatorio.</div>' : '')
      + '</div>'
      + '<div style="background:rgba(0,0,0,0.03);padding:16px 24px;display:flex;gap:12px;justify-content:center;">'
      + '<button id="rot-mc-cancel" class="btn btn-outline-secondary" style="flex:1;border-radius:10px;font-weight:600;">Cancelar</button>'
      + '<button id="rot-mc-ok" class="btn btn-primary" style="flex:1;border-radius:10px;font-weight:600;">Confirmar</button>'
      + '</div></div>';

    document.body.appendChild(overlay);
    
    // Animate in
    setTimeout(function() {
        overlay.style.opacity = '1';
        overlay.firstChild.style.transform = 'scale(1)';
    }, 10);

    var ta   = document.getElementById('rot-mc-input');
    var err  = document.getElementById('rot-mc-err');
    var ok   = document.getElementById('rot-mc-ok');
    var can  = document.getElementById('rot-mc-cancel');
    if (ta) ta.focus();

    function cerrar() {
        overlay.style.opacity = '0';
        overlay.firstChild.style.transform = 'scale(0.95)';
        setTimeout(function(){ overlay.remove(); }, 200);
    }
    
    can.addEventListener('click', cerrar);
    
    ok.addEventListener('click', function() {
        var val = ta ? ta.value.trim() : '';
        if (requerido && !val) {
            if (err) err.style.display = 'block';
            if (ta) ta.focus();
            return;
        }
        cerrar();
        onConfirm(val);
    });
}
function rotConfirmModerno(titulo, mensaje, onConfirm, type) {
    type = type || 'danger';
    var iconClass = type === 'danger' ? 'bi-exclamation-triangle-fill text-danger' : 'bi-info-circle-fill text-primary';
    var btnClass = type === 'danger' ? 'btn-danger' : 'btn-primary';
    var btnText = type === 'danger' ? 'Sí, eliminar' : 'Confirmar';

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);opacity:0;transition:opacity 0.2s ease;';
    
    var modalHtml = '<div style="background:var(--surface,#fff);border-radius:16px;width:380px;max-width:90vw;box-shadow:0 10px 40px rgba(0,0,0,0.2);transform:scale(0.95);transition:transform 0.2s ease;overflow:hidden;">'
                  + '<div style="padding:24px 24px 16px;text-align:center;">'
                  + '<i class="bi ' + iconClass + '" style="font-size:3rem;line-height:1;margin-bottom:16px;display:block;"></i>'
                  + '<h5 style="margin:0 0 8px;font-weight:700;color:var(--text);">' + rotEscHtml(titulo) + '</h5>'
                  + '<p style="margin:0;font-size:0.9rem;color:var(--subtext);">' + rotEscHtml(mensaje) + '</p>'
                  + '</div>'
                  + '<div style="background:rgba(0,0,0,0.03);padding:16px 24px;display:flex;gap:12px;justify-content:center;">'
                  + '<button id="rot-cfm-cancel" class="btn btn-outline-secondary" style="flex:1;border-radius:10px;font-weight:600;">Cancelar</button>'
                  + '<button id="rot-cfm-ok" class="btn ' + btnClass + '" style="flex:1;border-radius:10px;font-weight:600;">' + btnText + '</button>'
                  + '</div></div>';
    overlay.innerHTML = modalHtml;
    document.body.appendChild(overlay);
    
    // Animate in
    setTimeout(function() {
        overlay.style.opacity = '1';
        overlay.firstChild.style.transform = 'scale(1)';
    }, 10);

    function cerrar() {
        overlay.style.opacity = '0';
        overlay.firstChild.style.transform = 'scale(0.95)';
        setTimeout(function(){ overlay.remove(); }, 200);
    }

    document.getElementById('rot-cfm-cancel').addEventListener('click', cerrar);
    document.getElementById('rot-cfm-ok').addEventListener('click', function() {
        cerrar();
        onConfirm();
    });
}

function rotPromptKm(currentKm, onConfirm) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);opacity:0;transition:opacity 0.2s ease;';
    
    var modalHtml = '<div style="background:var(--surface,#fff);border-radius:16px;width:380px;max-width:90vw;box-shadow:0 10px 40px rgba(0,0,0,0.2);transform:scale(0.95);transition:transform 0.2s ease;overflow:hidden;">'
                  + '<div style="padding:24px 24px 16px;">'
                  + '<h5 style="margin:0 0 16px;font-weight:700;color:var(--text);text-align:center;">Actualizar Kilometraje</h5>'
                  + '<div class="mb-3">'
                  + '<label class="form-label fw-bold" style="font-size:0.8rem;color:var(--subtext);">Kilometraje (KM)</label>'
              + '<input type="number" id="rot-prompt-km" class="form-control" style="border-radius:10px;text-align:center;font-weight:700;font-size:1.2rem;" value="' + (currentKm || 0) + '">'
                  + '</div>'
                  + '</div>'
                  + '<div style="background:rgba(0,0,0,0.03);padding:16px 24px;display:flex;gap:12px;justify-content:center;">'
                  + '<button id="rot-pkm-cancel" class="btn btn-outline-secondary" style="flex:1;border-radius:10px;font-weight:600;">Cancelar</button>'
                  + '<button id="rot-pkm-ok" class="btn btn-primary" style="flex:1;border-radius:10px;font-weight:600;">Guardar KM</button>'
                  + '</div></div>';
    overlay.innerHTML = modalHtml;
    document.body.appendChild(overlay);
    
    var inp = document.getElementById('rot-prompt-km');
    inp.focus();
    inp.select();

    // Animate in
    setTimeout(function() {
        overlay.style.opacity = '1';
        overlay.firstChild.style.transform = 'scale(1)';
    }, 10);

    function cerrar() {
        overlay.style.opacity = '0';
        overlay.firstChild.style.transform = 'scale(0.95)';
        setTimeout(function(){ overlay.remove(); }, 200);
    }

    document.getElementById('rot-pkm-cancel').addEventListener('click', cerrar);
    document.getElementById('rot-pkm-ok').addEventListener('click', function() {
        var v = parseFloat(inp.value);
        cerrar();
        onConfirm(v);
    });
}

// ── Acciones del drawer (Editar, Eliminar, Cerrar, PDF) ──
window.rotAccion = async function(accion, idOT) {
    var ot = await window.rotObtenerOTAsync(idOT);
    if (!ot && accion !== 'pdf') return;

    var refrescar = function() {
        if (typeof window.rotCargar === 'function' && document.getElementById('moduloReportesOT')) {
            window.rotCargar();
        }
        if (typeof window.srCargarOTs === 'function') {
            window.srCargarOTs();
        }
        if (typeof window.srCargarEntradas === 'function') {
            window.srCargarEntradas();
        }
    };

    if (accion === 'reactivar') {
        if (!window.guardAction('ot', 'e')) return;
        rotConfirmModerno('Reactivar OT', '¿Deseas reactivar la OT ' + idOT + '? Volverá a estar En Proceso.', function() {
            fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'reactivar' })
            })
            .then(function(res) { if(!res.ok) throw new Error(res.status); return res.json(); })
            .then(function() {
                if(typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT reactivada', 'success');
                window.rotCerrarDetalle();
                refrescar();
            })
            .catch(function(err) {
                if(typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al reactivar OT', 'danger');
            });
        }, 'success');
        return;
    }

    if (accion === 'eliminar') {
        if (!window.guardAction('ot', 'd')) return;
        rotConfirmModerno('Eliminar OT', '¿Eliminar la OT ' + idOT + '? Esta acción no se puede deshacer.', function() {
            fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), { method: 'DELETE' })
                .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); })
                .then(function() {
                    window.rotCerrarDetalle();
                    if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT eliminada', 'success');
                    refrescar();
                })
                .catch(function(err) {
                    console.error('Error eliminando OT:', err);
                    if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar la OT', 'danger');
                });
        }, 'danger');
        return;
    }

    if (accion === 'iniciar') {
        if (!window.guardAction('ot', 'e')) return;
        rotConfirmModerno('Iniciar OT', '¿Iniciar la OT ' + idOT + '?', function() {
            var fInicio = ot.fecha_ingreso || ot.creado_en || null;
            if (fInicio) {
                var pIso = typeof fInicio === 'string' ? fInicio.replace('Z','') : fInicio;
                var d = new Date(pIso);
                if (!isNaN(d.getTime())) {
                    var p = function(n){ return n<10?'0'+n:n; };
                    fInicio = d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
                } else { fInicio = null; }
            }
            fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'iniciar', iniciado_por: localStorage.getItem('fleet_correo') || '', fecha_inicio: fInicio })
            })
            .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); })
            .then(function() {
                window.rotCerrarDetalle();
                if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT iniciada', 'success');
                refrescar();
            })
            .catch(function(err) {
                console.error('Error iniciando OT:', err);
                if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al iniciar la OT', 'danger');
            });
        }, 'primary');
        return;
    }

    if (accion === 'pausar') {
        if (!window.guardAction('ot', 'e')) return;
        rotModalComentario('Motivo de la pausa', 'Escribe el motivo (obligatorio)…', true, function(motivo) {
            fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'pausar', motivo: motivo, pausado_por: localStorage.getItem('fleet_correo') || '' })
            })
            .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); })
            .then(function() {
                window.rotCerrarDetalle();
                if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT pausada', 'warning');
                refrescar();
            })
            .catch(function(err) {
                console.error('Error pausando OT:', err);
                if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al pausar la OT', 'danger');
            });
        });
        return;
    }

    if (accion === 'reanudar') {
        if (!window.guardAction('ot', 'e')) return;
        fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'reanudar' })
        })
        .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); })
        .then(function() {
            window.rotCerrarDetalle();
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT reanudada', 'success');
            refrescar();
        })
        .catch(function(err) {
            console.error('Error reanudando OT:', err);
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al reanudar la OT', 'danger');
        });
        return;
    }

    if (accion === 'cerrar') {
        if (!window.guardAction('ot', 'e')) return;
        rotModalComentario('Comentario de cierre', 'Escribe las observaciones de cierre (obligatorio)…', true, function(comentario) {
            var pad = function(n) { return String(n).padStart(2, '0'); };
            var dn = new Date();
            var fSalida = dn.getFullYear() + '-' + pad(dn.getMonth()+1) + '-' + pad(dn.getDate()) + ' ' + pad(dn.getHours()) + ':' + pad(dn.getMinutes()) + ':' + pad(dn.getSeconds());

            fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'cerrar',
                    comentario_cierre: comentario,
                    cerrado_por: localStorage.getItem('fleet_correo') || '',
                    fecha_hora_salida: fSalida
                })
            })
            .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); })
            .then(function() {
                window.rotCerrarDetalle();
                if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT cerrada', 'success');
                refrescar();
            })
            .catch(function(err) {
                console.error('Error cerrando OT:', err);
                if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al cerrar la OT', 'danger');
            });
        });
        return;
    }

    if (accion === 'editar') {
        if (!window.guardAction('ot', 'e')) return;
        rotAbrirEditarOT(idOT);
        return;
    }

    if (accion === 'anular') {
        if (!window.guardAction('ot', 'e')) return;
        rotConfirmModerno('Anular OT', '¿Anular la OT ' + idOT + '?', function() {
            fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'anular' })
            })
            .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); })
            .then(function() {
                window.rotCerrarDetalle();
                if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT anulada', 'success');
                refrescar();
            })
            .catch(function(err) {
                console.error('Error anulando OT:', err);
                if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al anular la OT', 'danger');
            });
        }, 'danger');
        return;
    }

    if (accion === 'pdf') {
        rotGenerarPDF(idOT);
        return;
    }
};

// ── Exportar a Excel ──────────────────────────────────────────────
window.rotExportar = function() {
    var lista = window.rotDatosFiltrados.length > 0 ? window.rotDatosFiltrados : window.rotData;
    if (!lista || lista.length === 0) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('No hay datos para exportar.', 'warning');
        return;
    }

    var fmtD = function(d) {
        if (!d) return '';
        var pad = function(n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    };
    var str  = function(v) { return String(v == null ? '' : v); };

    var encabezado = [
        'N° OT', 'Placa', 'Estado', 'Tipo OT', 'Sub Tipo', 'Sistema', 'Sub Sistema',
        'Supervisor', 'Situación Inicial', 'Observaciones', 'Costo Total (S/)',
        'Ingreso Taller', 'Inicio OT', 'Iniciado Por',
        'Pausa 1', 'Motivo Pausa 1', 'Fin Pausa 1',
        'Pausa 2', 'Motivo Pausa 2', 'Fin Pausa 2',
        'Pausa 3', 'Motivo Pausa 3', 'Fin Pausa 3',
        'Cierre OT', 'Cerrado Por', 'Comentario Cierre',
        'Tiempo Trabajado (min)', 'Tiempo Muerto (min)'
    ];

    var filas = lista.map(function(ot) {
        var det = rotDetalles(ot);
        var t   = rotCalcularTiempos(ot);
        return [
            str(ot.ticket_entrada || ot.id_ot),
            str(ot.placa),
            str(ot.estado || 'Pendiente'),
            str(det.tipo_ot || ot.tipo),
            str(det.sub_tipo),
            str(det.sistema),
            str(det.sub_sistema),
            str(det.supervisor || ot.supervisor),
            str(det.situacion_inicial || ot.situacion),
            str(det.motivo || ot.observaciones),
            parseFloat(ot.costo_total || 0),
            str(rotFechaISO(ot.fecha_ingreso || ot.creado_en)),
            fmtD(t.inicio),
            str(ot.iniciado_por),
            fmtD(t.pausas[0] ? t.pausas[0].inicio : null),
            str(t.pausas[0] ? t.pausas[0].motivo : ''),
            fmtD(t.pausas[0] ? t.pausas[0].fin   : null),
            fmtD(t.pausas[1] ? t.pausas[1].inicio : null),
            str(t.pausas[1] ? t.pausas[1].motivo : ''),
            fmtD(t.pausas[1] ? t.pausas[1].fin   : null),
            fmtD(t.pausas[2] ? t.pausas[2].inicio : null),
            str(t.pausas[2] ? t.pausas[2].motivo : ''),
            fmtD(t.pausas[2] ? t.pausas[2].fin   : null),
            fmtD(t.fin),
            str(ot.cerrado_por),
            str(ot.comentario_cierre),
            Math.round(t.tiempoTrabajadoMs / 60000),
            Math.round(t.tiempoMuertoMs   / 60000)
        ];
    });

    var datos = [encabezado].concat(filas);
    var ws = XLSX.utils.aoa_to_sheet(datos);

    // Ancho automático por columna
    var wscols = encabezado.map(function(h, i) {
        var maxLen = h.length;
        filas.forEach(function(f) { var v = str(f[i]); if (v.length > maxLen) maxLen = v.length; });
        return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = wscols;

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reportes OT');
    XLSX.writeFile(wb, 'Reportes_OT_' + new Date().toISOString().slice(0,10) + '.xlsx');
};

// ── PDF de una OT (jsPDF + autoTable) ────────────────────────────
function rotGenerarPDF(idOT) {
    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
    if (!ot) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT no encontrada', 'danger'); return; }
    window.generarPDF_OT(ot, window.rotOtTrabajosActivos, window.rotOtMaterialesActivos);
}

// ── PDF del reporte (tabla filtrada) ─────────────────────────────
window.rotExportarPDF = function() {
    var lista = window.rotDatosFiltrados.length > 0 ? window.rotDatosFiltrados : window.rotData;
    if (!lista || lista.length === 0) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('No hay datos para exportar.', 'warning');
        return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('jsPDF no disponible', 'danger');
        return;
    }
    var jsPDF   = window.jspdf.jsPDF;
    var doc     = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    var azul    = [37, 99, 235];
    var pageW   = doc.internal.pageSize.getWidth();

    // Encabezado
    doc.setFillColor(azul[0], azul[1], azul[2]);
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text('REPORTE DE ÓRDENES DE TRABAJO — AZKELL FLEET', 14, 12);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('Generado: ' + new Date().toLocaleString('es-PE'), pageW - 14, 12, { align: 'right' });

    // Filtros activos
    var filtros = [];
    var filOT    = rotVal('rot-fil-ot');
    var filPlaca = rotVal('rot-fil-placa');
    var filMes   = rotVal('rot-fil-mes');
    var filDesde = rotVal('rot-fil-desde');
    var filHasta = rotVal('rot-fil-hasta');
    var filEst   = window._rotFiltroEstado || '';
    var filLibre = rotVal('rot-busqueda-libre');
    if (filLibre) filtros.push('Búsqueda: ' + filLibre);
    if (filOT)    filtros.push('N° OT: ' + filOT);
    if (filPlaca) filtros.push('Placa: ' + filPlaca);
    if (filMes)   filtros.push('Mes: ' + filMes);
    if (filDesde) filtros.push('Desde: ' + filDesde);
    if (filHasta) filtros.push('Hasta: ' + filHasta);
    if (filEst)   filtros.push('Estado: ' + filEst);

    var y = 23;
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    if (filtros.length) {
        doc.text('Filtros: ' + filtros.join('  |  '), 14, y);
        y += 5;
    }

    // KPIs resumen
    var costoTotal = lista.reduce(function(s,o){ return s + parseFloat(o.costo_total || 0); }, 0);
    var costoCorr  = lista.filter(function(o){ var d=rotDetalles(o); return (d.tipo_ot||o.tipo||'')==='Correctivo'; })
                         .reduce(function(s,o){ return s + parseFloat(o.costo_total || 0); }, 0);
    var costoPrev  = lista.filter(function(o){ var d=rotDetalles(o); return (d.tipo_ot||o.tipo||'')==='Preventivo'; })
                         .reduce(function(s,o){ return s + parseFloat(o.costo_total || 0); }, 0);
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text('Total OTs: ' + lista.length + '   |   Costo Total: S/' + costoTotal.toFixed(2)
           + '   |   Correctivo: S/' + costoCorr.toFixed(2)
           + '   |   Preventivo: S/' + costoPrev.toFixed(2), 14, y);
    y += 5;

    // Tabla
    var body = lista.map(function(ot) {
        var det   = rotDetalles(ot);
        var idOT  = ot.ticket_entrada || ot.id_ot || '—';
        var tipo  = det.tipo_ot || ot.tipo || '—';
        var sub   = det.sub_tipo || '—';
        var sup   = det.supervisor || ot.supervisor || '—';
        var estado = ot.aprobacion || ot.estado || '—';
        var costo = 'S/' + parseFloat(ot.costo_total || 0).toFixed(2);
        var fecha = rotFechaISO(ot.creado_en || ot.fecha_ingreso);
        return [idOT, ot.placa || '—', tipo + ' / ' + sub, sup, estado, costo, fecha];
    });

    doc.autoTable({
        startY: y,
        head:   [['N° OT', 'Placa', 'Tipo / Sub Tipo', 'Supervisor', 'Estado', 'Costo Total', 'Fecha']],
        body:   body,
        theme:  'striped',
        headStyles: { fillColor: azul, textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [240, 245, 255] },
        columnStyles: { 5: { halign: 'right' } },
        margin: { left: 14, right: 14 }
    });

    // Total al final
    var finalY = doc.lastAutoTable.finalY + 6;
    doc.setFillColor(22, 163, 74);
    doc.rect(14, finalY, pageW - 28, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('COSTO TOTAL: S/' + costoTotal.toFixed(2)
           + '   CORRECTIVO: S/' + costoCorr.toFixed(2)
           + '   PREVENTIVO: S/' + costoPrev.toFixed(2),
           pageW / 2, finalY + 6, { align: 'center' });

    doc.save('Reporte_OT_' + new Date().toISOString().slice(0, 10) + '.pdf');
};

// ── Generador global de PDF de OT (reutilizable desde otros módulos) ──
window.generarPDF_OT = function(ot, trabajos, materiales, isPlantilla, _onHtmlReady) {
    if (typeof window.html2pdf !== 'function') {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Librería html2pdf no cargada.', 'danger');
        return;
    }

    var det = {};
    try { det = typeof ot.detalles_json === 'string' ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {}); } catch(e) {}

    // Merge con padre si es OT hija
    if (ot.ticket_visita) {
        var pOT = null;
        if (window.rotData) pOT = window.rotData.find(function(x){return x.ticket_entrada === ot.ticket_visita;});
        if (!pOT && window.srEntradas) pOT = window.srEntradas.find(function(x){return x.ticket_entrada === ot.ticket_visita || x.ticket === ot.ticket_visita;});
        
        if (pOT) {
            var detP = {};
            try { detP = typeof pOT.detalles_json === 'string' ? JSON.parse(pOT.detalles_json) : (pOT.detalles_json||{}); } catch(e){}
            det.motivo = det.motivo || detP.motivo || pOT.observaciones || pOT.motivo || '';
            det.cliente = det.cliente || detP.cliente || pOT.cliente || '';
            det.km_gps = det.km_gps || detP.km_gps || pOT.km_gps || '';
            det.km_tablero = det.km_tablero || detP.km_tablero || pOT.km_tablero || pOT.km || '';
            det.rampa_origen = det.rampa_origen || detP.rampa_origen || pOT.txtRampa || pOT.rampa || '';
            ot.fecha_ingreso = ot.fecha_ingreso || pOT.fecha_ingreso || pOT.creado_en || '';
        }
    }


    var numOT = ot.id_ot || ot.ticket_entrada || '';
    var numPart = numOT, anioPart = '';
    if (numOT.includes('-')) {
        var parts = numOT.split('-');
        if (parts.length >= 3) {
            if (parts[1].startsWith('20')) {
                anioPart = parts[1];
                numPart = parts[2];
            } else {
                anioPart = parts[2];
                numPart = parts[1];
            }
        } else {
            numPart = numOT;
        }
    }

    var pMarca = det.marca || '';
    var pCliente = det.cliente || ot.cliente || '';
    if (window.dataGlobalPlacas && ot.placa) {
        var pData = window.dataGlobalPlacas.find(function(p) { return p[0] === ot.placa; });
        if (pData) {
            if (!pCliente) pCliente = pData[1];
            if (!pMarca) pMarca = pData[3];
        }
    }

    function formatDT(iso) {
        if (!iso) return { d: '—', h: '—' };
        try {
            var s = typeof iso === 'string' ? iso.replace('Z', '') : iso;
            var d = new Date(s);
            if (isNaN(d.getTime())) return { d: '—', h: '—' };
            var dd = String(d.getDate()).padStart(2,'0');
            var mm = String(d.getMonth()+1).padStart(2,'0');
            var yy = d.getFullYear();
            var hh = String(d.getHours()).padStart(2,'0');
            var min = String(d.getMinutes()).padStart(2,'0');
            return { d: dd+'/'+mm+'/'+yy, h: hh+':'+min };
        } catch(e) { return { d: '—', h: '—' }; }
    }

    var iniDT = formatDT(ot.fecha_inicio_ot || ot.fecha_ingreso);
    var finDT = formatDT(ot.fecha_hora_salida);

    var htmlMotivos = '';
    if (det.trabajos_det && Array.isArray(det.trabajos_det) && det.trabajos_det.length > 0) {
        htmlMotivos = det.trabajos_det.map(function(td, idx) {
            var descClean = String(td.desc || '').replace(/^(?:\d+[\.\)\-]?\s*)+/, '').trim();
            var tecName = td.tecnico || det.supervisor || '—';
            return '<tr>'
                + '<td class="text-center">' + (idx + 1) + '</td>'
                + '<td>' + rotEscHtml(rotCleanObsText(descClean)) + '</td>'
                + '<td class="text-center">' + rotEscHtml(tecName) + '</td>'
                + '</tr>';
        }).join('');
    } else if (det.motivos_array && Array.isArray(det.motivos_array) && det.motivos_array.length > 0) {
        htmlMotivos = det.motivos_array.map(function(m, idx) {
            var motText = typeof m === 'string' ? m : (m.motivo || m.item || m.descripcion || '—');
            var cleanText = String(motText || '').replace(/^(?:\d+[\.\)\-]?\s*)+/, '').trim();
            var tecText = typeof m === 'object' ? (m.tecnico || m.tecnico_nombre || det.supervisor || '—') : (det.supervisor || '—');
            return '<tr>'
                + '<td class="text-center">' + (idx + 1) + '</td>'
                + '<td>' + rotEscHtml(rotCleanObsText(cleanText)) + '</td>'
                + '<td class="text-center">' + rotEscHtml(tecText) + '</td>'
                + '</tr>';
        }).join('');
    } else if (det.motivo) {
        var lineas = String(det.motivo).split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
        if (lineas.length > 1) {
            htmlMotivos = lineas.map(function(l, idx) {
                var cleanL = l.replace(/^[•\-\*]\s*/, '').replace(/^(?:\d+[\.\)\-]?\s*)+/, '').trim();
                return '<tr>'
                    + '<td class="text-center">' + (idx + 1) + '</td>'
                    + '<td>' + rotEscHtml(rotCleanObsText(cleanL)) + '</td>'
                    + '<td class="text-center">' + rotEscHtml(det.supervisor || '—') + '</td>'
                    + '</tr>';
            }).join('');
        } else {
            var cleanSingle = String(det.motivo).replace(/^(?:\d+[\.\)\-]?\s*)+/, '').trim();
            htmlMotivos = '<tr><td class="text-center">1</td><td>' + rotEscHtml(rotCleanObsText(cleanSingle)) + '</td><td class="text-center">' + rotEscHtml(det.supervisor || '—') + '</td></tr>';
        }
    } else {
        htmlMotivos = '<tr><td colspan="3" class="text-center" style="color:#888; font-style: italic; padding: 4px;">No hay motivos de ingreso registrados.</td></tr>';
    }

    var htmlTrabajos = '';
    var trbArr = trabajos || [];
    if (isPlantilla) {
        for (var i=0; i<10; i++) {
            htmlTrabajos += '<tr><td class="text-center">' + (i+1) + '</td><td></td><td></td><td></td><td></td></tr>';
        }
    } else if (trbArr.length === 0) {
        htmlTrabajos = '<tr><td colspan="5" class="text-center" style="color:#888; font-style: italic; padding: 4px;">No hay trabajos registrados.</td></tr>';
    } else {
        for (var i=0; i<trbArr.length; i++) {
            var t = trbArr[i];
            var det2 = {};
            try { det2 = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); } catch(e) {}
            
            var tIni = formatDT(t.fecha_trabajo || t.fecha_inicio || t.fecha || t.fecha_creacion);
            var tFin = formatDT(t.fecha_salida || t.fecha_fin || t.fecha_cierre);
            var tIniStr = (tIni.d !== '—') ? tIni.d + ' ' + tIni.h : '—';
            var tFinStr = (tFin.d !== '—') ? tFin.d + ' ' + tFin.h : '—';
            
            htmlTrabajos += '<tr>'
                + '<td class="text-center">' + (i+1) + '</td>'
                + '<td class="text-center">' + tIniStr + '</td>'
                + '<td>' + rotEscHtml(t.trabajo_realizado || '—') + '</td>'
                + '<td class="text-center">' + rotEscHtml(det2.personal || t.tecnico || '—') + '</td>'
                + '<td class="text-center">' + tFinStr + '</td>'
                + '</tr>';
        }
    }

    var htmlMateriales = '';
    var matArr = materiales || [];
    var matRows = [];
    var totalMontoMateriales = 0;
    matArr.forEach(function(m) {
        var items = Array.isArray(m.items) ? m.items : [];
        items.forEach(function(it) {
            var desc = it.descripcion || '';
            var codigo = it.inventario_id || '';
            var pDesc = desc.replace(/ —\s*$/, '').trim();
            var pMarca = '';

            // Limpiar prefijo repetido (ej. "INV-0642 — INV-0642 — Tuerca...")
            if (codigo) {
                while (pDesc.startsWith(codigo + ' — ') || pDesc.startsWith(codigo + ' - ')) {
                    pDesc = pDesc.substring(codigo.length + 3).trim();
                }
                if (pDesc === codigo) pDesc = '';
            }

            var lastDash = pDesc.lastIndexOf(' — ');
            if (lastDash !== -1) {
                var posMarca = pDesc.substring(lastDash + 3).trim();
                if (posMarca.toUpperCase() === 'SIN MARCA') {
                    pMarca = 'SIN MARCA';
                    pDesc = pDesc.substring(0, lastDash).trim();
                }
            }

            var lastSlash = pDesc.lastIndexOf(' / ');
            if (lastSlash !== -1) {
                if (!pMarca || pMarca === 'SIN MARCA') {
                    pMarca = pDesc.substring(lastSlash + 3).trim();
                }
                pDesc = pDesc.substring(0, lastSlash).trim();
            } else if (pDesc.endsWith('/')) {
                pDesc = pDesc.substring(0, pDesc.length - 1).trim();
            }

            if (pDesc.endsWith('/')) {
                pDesc = pDesc.substring(0, pDesc.length - 1).trim();
            }

            if (!pDesc && codigo) {
                pDesc = desc; // Fallback
            }

            var itemTotal = parseFloat(it.importe) || 0;
            totalMontoMateriales += itemTotal;

            matRows.push({
                codigo: it.inventario_id || '',
                producto: pDesc,
                marca: pMarca,
                cantidad: it.cantidad,
                costo: it.costo_unitario,
                total: itemTotal
            });
        });
    });

    if (matRows.length === 0) {
        htmlMateriales = '<tr><td colspan="7" class="text-center" style="color:#888; font-style: italic; padding: 4px;">No hay salidas registradas.</td></tr>';
    } else {
        matRows.forEach(function(r, idx) {
            htmlMateriales += '<tr>'
                + '<td class="text-center">' + (idx + 1) + '</td>'
                + '<td class="text-center">' + rotEscHtml(r.codigo) + '</td>'
                + '<td>' + rotEscHtml(r.producto) + '</td>'
                + '<td class="text-center">' + rotEscHtml(r.marca) + '</td>'
                + '<td class="text-center">' + rotEscHtml(r.cantidad) + '</td>'
                + '<td class="text-center">' + parseFloat(r.costo||0).toFixed(2) + '</td>'
                + '<td class="text-center">' + parseFloat(r.total||0).toFixed(2) + '</td>'
                + '</tr>';
        });
        htmlMateriales += '<tr><td colspan="6" style="text-align: right; font-weight: bold; padding-right: 10px;">TOTAL:</td><td class="text-center" style="font-weight: bold; background-color: #f2f2f2;">' + totalMontoMateriales.toFixed(2) + '</td></tr>';
    }

    var htmlMaterialesTable = '';
    if (!isPlantilla) {
        htmlMaterialesTable = `
        <div class="section-title">Salidas de Almacén</div>
        <table class="content-table trabajos-table">
            <thead>
                <tr>
                    <th style="width: 30px;" class="text-center">#</th>
                    <th style="width: 70px;" class="text-center">Cód. Producto</th>
                    <th>Producto</th>
                    <th style="width: 75px;" class="text-center">Marca</th>
                    <th style="width: 40px;" class="text-center">Cant.</th>
                    <th style="width: 55px;" class="text-center">Costo</th>
                    <th style="width: 60px;" class="text-center">Total</th>
                </tr>
            </thead>
            <tbody>
                ${htmlMateriales}
            </tbody>
        </table>
        `;
    }

    var htmlObservaciones = '';
    if (isPlantilla) {
        htmlObservaciones = `
        <div class="section-title">OBSERVACIONES</div>
        <div class="observaciones-box"></div>
        `;
    }

    var htmlBacklog = '<tr><td colspan="3" class="text-center" style="color:#888; font-style: italic; padding: 4px;">No hay mantenimientos pendientes reportados.</td></tr>';

    var container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    
    var empLogoUrl = localStorage.getItem('fleet_empresa_logo') || window._LOGO_BASE64 || 'https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500';
    container.innerHTML = `
    <div class="page-container" style="width: 210mm; min-height: 296mm; background: white; padding: 6mm 10mm; box-sizing: border-box; position: relative; display: flex; flex-direction: column; overflow: hidden; font-family: 'Oswald', sans-serif; color: #000;">
        <style>
            .page-container * { font-family: 'Oswald', sans-serif !important; box-sizing: border-box; }
            .iso-header { width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 4px; table-layout: fixed; flex-shrink: 0; }
            .iso-header td { border: 1px solid #000; text-align: center; vertical-align: middle; }
            .logo-cell { width: 20%; padding: 2px; }
            .title-cell { width: 55%; font-size: 24px; font-weight: bold; line-height: 1; text-transform: uppercase; color: #000; }
            .sub-title { font-size: 12px; font-weight: normal; color: #333; letter-spacing: 1px; }
            .qms-item { width: 25%; font-size: 10px; text-align: left !important; padding: 1px 5px; height: 16px; }
            
            .data-grid { width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 5px; table-layout: fixed; flex-shrink: 0; }
            .data-grid td { border: 1px solid #000; padding: 1px 4px; font-size: 11px; font-weight: bold; height: 20px; vertical-align: middle; }
            .val-normal { font-weight: normal; margin-left: 4px; }
            .val-blue { color: #1e60bf; font-size: 14px; margin-left: 4px; }
            
            .aviso { background-color: #f2f2f2; padding: 3px 8px; font-size: 11px; font-weight: bold; text-align: center; border: 2px solid #000; margin-bottom: 5px; flex-shrink: 0; }
            .aviso span { color: #cc2222; font-size: 13px; margin-left: 5px; }
            
            .section-title { background: #444444; color: #fff; font-weight: 700; font-size: 11px; letter-spacing: .5px; padding: 2px 8px; text-align: center; text-transform: uppercase; border: 2px solid #000; border-bottom: none; flex-shrink: 0; margin: 0; }
            
            .content-table { width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 5px; table-layout: fixed; font-size: 10px; flex-shrink: 0; }
            .content-table th { background-color: #444444; color: white; text-align: left; padding: 2px 4px; border: 1px solid #000; }
            .content-table td { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; word-break: break-word; }
            .text-center { text-align: center !important; }
            .trabajos-table td { height: 20px; }
            
            .observaciones-box { flex-grow: 1; border: 2px solid #000; margin-bottom: 15px; padding: 5px; min-height: 40px; }
            
            .footer { flex-shrink: 0; height: 90px; display: flex; justify-content: space-between; align-items: flex-end; padding: 0 10px 10px 10px; }
            .sign-box { width: 30%; text-align: center; padding-top: 60px; }
            .sign-line { border-top: 2px solid #000; margin-bottom: 3px; }
            .sign-label { font-weight: bold; font-size: 11px; }
        </style>

        <table class="iso-header">
            <tr>
                <td class="logo-cell" rowspan="3">
                    <img src="${empLogoUrl}" alt="Logo Empresa" style="max-width: 100%; max-height: 45px; object-fit: contain;">
                </td>
                <td class="title-cell" rowspan="3">
                    ORDEN DE TRABAJO<br>
                    <span class="sub-title">MANTENIMIENTO MECÁNICO</span>
                </td>
                <td class="qms-item"><b>CÓDIGO:</b> F-MAN-002</td>
            </tr>
            <tr><td class="qms-item"><b>VERSIÓN:</b> 0</td></tr>
            <tr><td class="qms-item"><b>F. EMISIÓN:</b> 10/11/2025</td></tr>
        </table>

        <table class="data-grid">
            <tr>
                <td style="width: 33%;">Nº OT: <span class="val-blue">${anioPart ? anioPart + "-" : ""}${numPart}</span></td>
                <td style="width: 33%;">Placa: <span class="val-normal">${rotEscHtml(ot.placa || '—')}</span></td>
                <td style="width: 34%;">Marca: <span class="val-normal">${rotEscHtml(pMarca || '—')}</span></td>
            </tr>
            <tr>
                <td>Cliente: <span class="val-normal">${rotEscHtml(pCliente || '—')}</span></td>
                <td>Kms GPS: <span class="val-normal">${rotEscHtml(det.km_gps || '—')}</span></td>
                <td>Kms Tablero: <span class="val-normal">${rotEscHtml(det.km || '—')}</span></td>
            </tr>
            <tr>
                <td>Tipo OT: <span class="val-normal">${rotEscHtml(det.tipo_ot || '—')}</span></td>
                <td>Sub Tipo: <span class="val-normal">${rotEscHtml(det.sub_tipo || '—')}</span></td>
                <td>Rampa: <span class="val-normal">${rotEscHtml(det.rampa_origen || '—')}</span></td>
            </tr>
            <tr>
                <td colspan="2">Inicio: <span class="val-normal">${iniDT.d} &nbsp;&nbsp;|&nbsp;&nbsp; Hora: ${iniDT.h}</span></td>
                <td>Término: <span class="val-normal">${finDT.d} &nbsp;&nbsp;|&nbsp;&nbsp; Hora: ${finDT.h}</span></td>
            </tr>
        </table>

        <div class="aviso">
            Se le informa que la unidad ingresó a mantenimiento para el siguiente servicio. PLACA: <span>${rotEscHtml(ot.placa || '—')}</span>
        </div>

        <div class="section-title">Motivo de ingreso</div>
        <table class="content-table">
            <thead>
                <tr>
                    <th style="width: 30px;" class="text-center">#</th>
                    <th>Lista de motivos</th>
                    <th style="width: 120px;" class="text-center">Técnico</th>
                </tr>
            </thead>
            <tbody>
                ${htmlMotivos}
            </tbody>
        </table>

        <div class="section-title">Backlog</div>
        <table class="content-table">
            <thead>
                <tr>
                    <th style="width: 30px;" class="text-center">#</th>
                    <th>Lista de mantenimientos pendientes</th>
                    <th style="width: 60px;" class="text-center">Check</th>
                </tr>
            </thead>
            <tbody>
                ${htmlBacklog}
            </tbody>
        </table>

        <div class="section-title">Trabajos a realizar</div>
        <table class="content-table trabajos-table">
            <thead>
                <tr>
                    <th style="width: 30px;" class="text-center">#</th>
                    <th style="width: 100px;" class="text-center">Fecha/Hora inicio</th>
                    <th>Trabajo a realizar</th>
                    <th style="width: 80px;" class="text-center">Técnico</th>
                    <th style="width: 100px;" class="text-center">Fecha/Hora término</th>
                </tr>
            </thead>
            <tbody>
                ${htmlTrabajos}
            </tbody>
        </table>

        ${htmlMaterialesTable}
        ${htmlObservaciones}
        
        <div class="footer">
            <div class="sign-box">
                <div class="sign-line"></div>
                <div class="sign-label">Jefe de Taller</div>
            </div>
            <div class="sign-box">
                <div class="sign-line"></div>
                <div class="sign-label">Operaciones</div>
            </div>
            <div class="sign-box">
                <div class="sign-line"></div>
                <div class="sign-label">Planner de Mantenimiento</div>
            </div>
        </div>
    </div>`;

    var htmlBody = container.innerHTML;
    var finalHtml = '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n<title>Orden de Trabajo</title>\n'
                  + '<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap" rel="stylesheet">\n'
                  + '<style>\n'
                  + 'body { background-color: #e0e0e0; margin: 0; padding: 20px; display: flex; justify-content: center; }\n'
                  + '#btnPrint { position: fixed; top: 20px; right: 20px; background-color: #000; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; z-index: 1000; font-family: Oswald, sans-serif; font-size: 14px; }\n'
                  + '#btnPrint:hover { opacity: 0.9; }\n'
                  + '@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; } body { background: none; padding: 0; margin: 0; display: block; } #btnPrint { display: none; } .page-container { margin: 0 !important; box-shadow: none !important; } }\n'
                  + '</style>\n</head>\n<body>\n'
                  + '<button id="btnPrint" onclick="window.print()">Imprimir / Guardar PDF</button>\n'
                  + htmlBody
                  + '\n</body>\n</html>';
    // Si se pasa un callback, devolver el HTML sin abrir ventana (para preview en modal)
    if (typeof _onHtmlReady === 'function') {
        _onHtmlReady(finalHtml);
        return;
    }
    // Usar Blob con charset UTF-8 explicito para evitar caracteres corruptos
    var blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    window.open(url, '_blank');
};


window.rotGenerarPlantillaVaciaOT = function(idOt, placa) {
    if (typeof window.rotToast === 'function') window.rotToast('Generando plantilla...', 'bg-info');
    window.generarPDF_OT({ id_ot: idOt, placa: placa }, [], []);
};

window.rotGenerarPlantillaLlantasOT = async function(idOt) {
    if (typeof window.rotToast === 'function') window.rotToast('Generando Plantilla de Llantas A4...', 'bg-info');
    
    var ot = null;
    if (window.rotObtenerOTAsync) {
        ot = await window.rotObtenerOTAsync(idOt);
    }
    if (!ot && window.rotData) {
        ot = window.rotData.find(function(x){ return String(x.ticket_entrada || x.id_ot) === String(idOt); });
    }
    ot = ot || { id_ot: idOt, ticket_entrada: idOt, placa: '---' };

    var placa = (ot.placa || ot.placa_vehiculo || '---').toUpperCase().trim();
    var tipoOT = (ot.tipo_ot || ot.tipo || 'Preventivo').toUpperCase();
    var fechaInicio = ot.fecha_inicio_ot || ot.fecha_ingreso || ot.creado_en || new Date().toISOString().split('T')[0];
    try { fechaInicio = String(fechaInicio).split('T')[0]; } catch(e){}
    var kmTablero = ot.km_tablero || ot.km_gps || ot.km || '---';
    var rampa = ot.txtRampa || ot.rampa || '---';

    // Obtener logo y datos de empresa
    var empLogoUrl = localStorage.getItem('fleet_empresa_logo') || window._LOGO_BASE64 || '';
    var empNombre  = (localStorage.getItem('fleet_empresa_nombre') || 'EMPRESA').toUpperCase();

    var logoHtml = empLogoUrl 
        ? `<img src="${empLogoUrl}" style="max-height: 55px; max-width: 180px; object-fit: contain;">`
        : `<div class="company-name-text">${empNombre}</div>`;

    var renderFilaPosBlanco = function(posKey) {
        return `<tr>
            <td></td>
            <td class="pos-number">${posKey}</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td class="col-est-nueva option-text">Nueva</td>
            <td class="col-est-reen option-text">Reencauchada</td>
            <td></td>
            <td></td>
        </tr>`;
    };

    var posSec1 = ['1','2','3','4','5','6','7','8','9','10','11','12','R'];
    var posSec2 = ['1','2'];

    var htmlRows1 = posSec1.map(renderFilaPosBlanco).join('');
    var htmlRows2 = posSec2.map(renderFilaPosBlanco).join('');

    var fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Plantilla de Llantas - OT ${idOt}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
    * { box-sizing: border-box; }
    body {
        font-family: 'Oswald', sans-serif;
        font-size: 11px;
        margin: 0;
        padding: 15px;
        background-color: #e0e0e0;
        color: #000000;
    }
    .print-btn-container { text-align: center; margin-bottom: 12px; }
    .btn-print {
        background-color: #000000;
        color: #ffffff;
        border: none;
        padding: 10px 25px;
        font-family: 'Oswald', sans-serif;
        font-size: 14px;
        font-weight: 700;
        text-transform: uppercase;
        cursor: pointer;
        border-radius: 4px;
        letter-spacing: 1px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .btn-print:hover { opacity: 0.9; }
    .report-container {
        width: 100%;
        max-width: 1120px;
        margin: 0 auto;
        border: 2px solid #000000;
        background-color: #fff;
        padding: 12px;
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; color: #000000; }
    
    /* CABECERA CON LOGO EMPRESA Y RECUADRO DE CÓDIGO A LA ESQUINA */
    .header-table { width: 100%; border-collapse: collapse; border: 2px solid #000000; margin-bottom: 8px; }
    .header-table td { border: 1px solid #000000; padding: 4px; vertical-align: middle; }
    .logo-cell { width: 220px; text-align: center; border-right: 1px solid #000000; }
    .company-name-text { font-family: 'Inter', sans-serif; font-weight: 800; font-size: 22px; color: #000000; text-transform: uppercase; }
    .title-cell { text-align: center; border-right: 1px solid #000000; }
    .main-title { font-weight: 700; font-size: 22px; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.1; }
    
    .qms-box-cell { width: 180px; padding: 0 !important; border: none !important; }
    .qms-subtable { width: 100%; border-collapse: collapse; font-family: 'Oswald', sans-serif; font-size: 10px; }
    .qms-subtable td { border-bottom: 1px solid #000000; padding: 2px 6px !important; text-align: left; height: 18px; }
    .qms-subtable tr:last-child td { border-bottom: none; }
    
    /* CUADRO INFO VEHÍCULO (SEGUNDA IMAGEN MARSISA) */
    .info-section-table { width: 100%; margin: 6px 0 10px 0; border-collapse: collapse; }
    .info-section-table td { vertical-align: middle; padding: 0; }
    .vehicle-box {
        border: 2px solid #000000;
        padding: 6px 10px;
        width: 640px;
        font-family: 'Oswald', sans-serif;
        font-size: 11px;
        line-height: 1.4;
    }
    .v-row { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-bottom: 2px; }
    .v-row:last-child { margin-bottom: 0; }
    .v-label { font-weight: 700; text-transform: uppercase; }
    .v-val { font-weight: 400; font-family: 'Inter', sans-serif; }
    .chk-box { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: 10px; }
    .chk-sq { width: 12px; height: 12px; border: 1px solid #000; display: inline-block; }

    .rampa-cell { text-align: right; vertical-align: middle !important; padding-right: 20px; }
    .rampa-label { font-size: 24px; font-weight: 700; }
    .rampa-value { font-size: 24px; font-weight: 400; margin-left: 8px; }

    /* GRILLA 100% BLANCA DE LLANTAS */
    .grid-table th, .grid-table td {
        border: 1px solid #000000;
        text-align: center;
        padding: 1px 2px;
        font-size: 11px;
        height: 19px;
        overflow: hidden;
        white-space: nowrap;
        vertical-align: middle;
        font-weight: 300;
        line-height: 1.1;
        color: #000000;
    }
    .grid-table th {
        font-weight: 500;
        background-color: #ffffff;
        text-transform: uppercase;
        height: 26px;
        white-space: normal;
        font-size: 10px;
        color: #000000;
    }
    .col-idx { width: 30px; }
    .col-pos { width: 40px; }
    .col-data-main { width: 95px; }
    .col-r { width: 18px; }
    .col-presion { width: 80px; }
    .col-est-nueva { width: 45px; }
    .col-est-reen { width: 65px; }
    .col-accion { width: 60px; }
    .col-obs { width: auto; }
    .option-text { font-size: 9px; font-weight: 500; }
    .pos-number { font-weight: 700; font-size: 12px; }
    .border-top-thick { border-top: 2px solid #000000; }
    .spacer { height: 8px; border-left: 2px solid #000000; border-right: 2px solid #000000; }
    
    .obs-container { padding: 6px 0 4px 0; font-size: 11px; }
    .obs-label { font-weight: 700; margin-bottom: 2px; display: block; }
    .obs-box { width: 100%; min-height: 55px; border: 2px solid #000000; }

    .signature-table { width: 100%; margin-top: 10px; font-family: 'Inter', sans-serif; font-size: 9.5px; }
    .signature-table td { text-align: center; vertical-align: bottom; height: 40px; }
    .signature-line { border-top: 1px solid #000; margin: 0 25px; padding-top: 3px; font-weight: 600; text-transform: uppercase; }

    @media print {
        @page { size: A4 landscape; margin: 4mm; }
        body { margin: 0; padding: 0; background-color: #fff; color: #000; }
        .print-btn-container { display: none !important; }
        .report-container { width: 100%; max-width: none; border: 2px solid #000; margin: 0; }
        .grid-table td { height: 19px !important; }
        .grid-table th { height: 26px !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: #000 !important; border-color: #000 !important; }
    }
</style>
</head>
<body>
    <div class="print-btn-container">
        <button class="btn-print" onclick="window.print()">🖨️ Imprimir Plantilla de Llantas (A4 Landscape)</button>
    </div>
    <div class="report-container">
        <table class="header-table">
            <tr>
                <td class="logo-cell" rowspan="3">
                    ${logoHtml}
                </td>
                <td class="title-cell" rowspan="3">
                    <div class="main-title">INSPECCIÓN DE NEUMÁTICOS</div>
                </td>
                <td class="qms-box-cell" style="border-bottom: 1px solid #000;">
                    <div style="padding: 2px 6px;"><b>CÓDIGO:</b> F-MAN-002</div>
                </td>
            </tr>
            <tr>
                <td class="qms-box-cell" style="border-bottom: 1px solid #000;">
                    <div style="padding: 2px 6px;"><b>VERSIÓN:</b> 0</div>
                </td>
            </tr>
            <tr>
                <td class="qms-box-cell">
                    <div style="padding: 2px 6px;"><b>F. EMISIÓN:</b> 10/11/2025</div>
                </td>
            </tr>
        </table>

        <table class="info-section-table">
            <tr>
                <td>
                    <div class="vehicle-box">
                        <div class="v-row">
                            <div><span class="v-label">FECHA:</span> <span class="v-val">${fechaInicio}</span></div>
                            <div><span class="v-label">PLACAS:</span> <span class="v-val" style="font-weight:700;">${placa}</span></div>
                            <div><span class="v-label">KILOMETRAJE:</span> <span class="v-val">${kmTablero}</span></div>
                            <div><span class="v-label">OT Nº:</span> <span class="v-val" style="font-weight:700;">${idOt}</span></div>
                        </div>
                        <div class="v-row">
                            <div><span class="v-label">TIPO OT:</span> <span class="v-val">${tipoOT}</span></div>
                            <div class="chk-box"><span class="chk-sq"></span> DUAL</div>
                            <div class="chk-box"><span class="chk-sq"></span> BALÓN</div>
                            <div class="chk-box"><span class="chk-sq"></span> VISUALIZACIÓN DE ZAPATAS</div>
                        </div>
                    </div>
                </td>
                <td class="rampa-cell">
                    <span class="rampa-label">RAMPA:</span>
                    <span class="rampa-value">${rampa}</span>
                </td>
            </tr>
        </table>

        <table class="grid-table border-top-thick">
            <thead>
                <tr>
                    <th class="col-idx">I.</th>
                    <th class="col-pos">Posición</th>
                    <th class="col-data-main">Marca</th>
                    <th class="col-data-main">Medida</th>
                    <th class="col-data-main">Modelo</th>
                    <th class="col-r">R1</th>
                    <th class="col-r">R2</th>
                    <th class="col-r">R3</th>
                    <th class="col-presion">Presión Aire<br>Encontrada</th>
                    <th class="col-presion">Presión Aire<br>Actual</th>
                    <th colspan="2" style="width: 110px;">Estado</th>
                    <th class="col-accion">Acción</th>
                    <th class="col-obs">Observación</th>
                </tr>
            </thead>
            <tbody>
                ${htmlRows1}
            </tbody>
        </table>

        <div class="spacer"></div>

        <table class="grid-table border-top-thick">
            <thead>
                <tr>
                    <th class="col-idx">II.</th>
                    <th class="col-pos">Posición</th>
                    <th class="col-data-main">Marca</th>
                    <th class="col-data-main">Medida</th>
                    <th class="col-data-main">Modelo</th>
                    <th class="col-r">R1</th>
                    <th class="col-r">R2</th>
                    <th class="col-r">R3</th>
                    <th class="col-presion">Presión Aire<br>Encontrada</th>
                    <th class="col-presion">Presión Aire<br>Actual</th>
                    <th colspan="2" style="width: 110px;">Estado</th>
                    <th class="col-accion">Acción</th>
                    <th class="col-obs">Observación</th>
                </tr>
            </thead>
            <tbody>
                ${htmlRows2}
            </tbody>
        </table>

        <div class="obs-container">
            <span class="obs-label">Observaciones :</span>
            <div class="obs-box"></div>
        </div>

        <table class="signature-table">
            <tr>
                <td><div class="signature-line">FIRMA TÉCNICO RAMPA</div></td>
                <td><div class="signature-line">FIRMA INSPECTOR DE FLOTA</div></td>
                <td><div class="signature-line">SUPERVISOR DE MANTENIMIENTO</div></td>
            </tr>
        </table>
    </div>
</body>
</html>`;

    var blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    window.open(url, '_blank');
};

// ── KPIs ─────────────────────────────────────────────────────────
function rotActualizarKPIs(lista) {
    var total       = lista.length;
    var correctivos = lista.filter(function(o) {
        var det = rotDetalles(o);
        return (det.tipo_ot || o.tipo || '') === 'Correctivo';
    }).length;
    var preventivos = lista.filter(function(o) {
        var det = rotDetalles(o);
        return (det.tipo_ot || o.tipo || '') === 'Preventivo';
    }).length;
    var cerrada   = lista.filter(function(o){ return o.aprobacion === 'Cerrada' || o.estado === 'Finalizado'; }).length;
    var enProceso = lista.filter(function(o){ return o.estado === 'En Proceso'; }).length;
    var costo   = lista.reduce(function(s,o){ return s + parseFloat(o.costo_total || 0); }, 0);
    var costoCorr = lista
        .filter(function(o){ var det = rotDetalles(o); return (det.tipo_ot || o.tipo || '') === 'Correctivo'; })
        .reduce(function(s,o){ return s + parseFloat(o.costo_total || 0); }, 0);
    var costoPrev = lista
        .filter(function(o){ var det = rotDetalles(o); return (det.tipo_ot || o.tipo || '') === 'Preventivo'; })
        .reduce(function(s,o){ return s + parseFloat(o.costo_total || 0); }, 0);

    rotSetKPI('rot-kpi-total',             total);
    rotSetKPI('rot-kpi-correctivos',       correctivos);
    rotSetKPI('rot-kpi-preventivos',       preventivos);
    rotSetKPI('rot-kpi-cerrada',           cerrada);
    rotSetKPI('rot-kpi-enproceso',         enProceso);
    rotSetKPI('rot-kpi-costo',             'S/' + costo.toFixed(2));
    rotSetKPI('rot-kpi-costo-correctivo',  'S/' + costoCorr.toFixed(2));
    rotSetKPI('rot-kpi-costo-preventivo',  'S/' + costoPrev.toFixed(2));
    rotSetKPI('rot-kpi-filtradas',         total);
}

function rotSetKPI(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ── Helpers de formato ────────────────────────────────────────────
function rotDetalles(ot) {
    if (!ot) return {};
    try { return typeof ot.detalles_json === 'string' ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {}); }
    catch(e) { return {}; }
}

function rotFmtMoney(val) {
    return 'S/' + parseFloat(val || 0).toFixed(2);
}

function rotFmtFecha(val) {
    if (!val) return '—';
    var dateObj = val;
    if (typeof val === 'string') {
        dateObj = new Date(val.replace('Z', ''));
    }
    if (isNaN(dateObj.getTime())) return String(val);
    var meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return String(dateObj.getDate()).padStart(2, '0') + ' ' + meses[dateObj.getMonth()] + ' ' + String(dateObj.getFullYear()).slice(2);
}

function rotFmtFechaHora(val) {
    if (!val) return '—';
    var dateObj = val;
    if (typeof val === 'string') {
        dateObj = new Date(val.replace('Z', ''));
    }
    if (isNaN(dateObj.getTime())) return String(val);
    var meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    var hh = String(dateObj.getHours()).padStart(2, '0');
    var mm = String(dateObj.getMinutes()).padStart(2, '0');
    return String(dateObj.getDate()).padStart(2, '0') + ' ' + meses[dateObj.getMonth()] + ' ' + String(dateObj.getFullYear()).slice(2) + ' ' + hh + ':' + mm;
}

function rotFechaISO(iso) {
    if (!iso) return '';
    if (iso instanceof Date) {
        var yyyy = iso.getFullYear();
        var mm = String(iso.getMonth() + 1).padStart(2, '0');
        var dd = String(iso.getDate()).padStart(2, '0');
        return yyyy + '-' + mm + '-' + dd;
    }
    var str = String(iso).trim();
    if (str.includes('T')) return str.split('T')[0];
    if (str.includes(' ')) {
        var p = str.split(' ')[0];
        if (p.includes('-')) return p;
    }
    if (str.length >= 10 && str.charAt(4) === '-' && str.charAt(7) === '-') return str.slice(0, 10);
    var d = new Date(str.replace('Z',''));
    if (!isNaN(d.getTime())) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }
    return '';
}

function rotBadgeAprobacion(estado) {
    var map = {
        'Pendiente': ['rot-b-pendiente', 'Pendiente'],
        'Aprobada':  ['rot-b-aprobada',  'Aprobada'],
        'Cerrada':   ['rot-b-cerrada',   'Cerrada'],
        'Anulado':   ['rot-b-anulado',   'Anulado']
    };
    var v = map[estado] || ['rot-b-pendiente', estado || '—'];
    return '<span class="rot-badge ' + v[0] + '">' + v[1] + '</span>';
}

function rotBadgeSituacion(sit) {
    if (!sit) return '—';
    var sitClean = String(sit).trim();
    var sitLower = sitClean.toLowerCase();
    var map = {
        'en atención':            ['rot-b-en-atencion', 'En Atención'],
        'en atencion':            ['rot-b-en-atencion', 'En Atención'],
        'espera de repuesto':     ['rot-b-espera',      'Espera Repuesto'],
        'espera repuesto':        ['rot-b-espera',      'Espera Repuesto'],
        'espera de autorización': ['rot-b-espera',      'Espera Autor.'],
        'espera de autorizacion': ['rot-b-espera',      'Espera Autor.'],
        'finalizado':             ['rot-b-cerrada',     'Finalizado']
    };
    var v = map[sitLower] || ['rot-b-en-atencion', sitClean];
    return '<span class="rot-badge ' + v[0] + '"><i class="bi bi-circle-fill me-1" style="font-size:0.45rem;"></i>' + v[1] + '</span>';
}

function rotBadgeTipo(tipo) {
    if (!tipo) return '—';
    return tipo === 'Preventivo'
        ? '<span class="rot-badge rot-b-tipo-prev">Prev.</span>'
        : '<span class="rot-badge rot-b-tipo-corr">Corr.</span>';
}

function rotField(lbl, val) {
    return '<div class="rot-field"><span class="rot-field-lbl">' + rotEscHtml(lbl) + '</span><span class="rot-field-val">' + val + '</span></div>';
}

function rotVal(id) {
    var el = document.getElementById(id);
    return el ? (el.value || '') : '';
}

function rotGetNombreUsuario(email) {
    if (!email) return '';
    if (window.dataGlobalUsuarios && Array.isArray(window.dataGlobalUsuarios)) {
        var u = window.dataGlobalUsuarios.find(function(user) { 
            return String(user[0]).toLowerCase() === String(email).toLowerCase() || 
                   String(user[1]).toLowerCase() === String(email).toLowerCase(); 
        });
        if (u && u[1]) return u[1];
    }
    return email.split('@')[0];
}

window.rotAbrirInspeccionWrapper = function(placa, idOT, km) {
    if (typeof window.abrirModalNuevaInspeccion === 'function') {
        window.abrirModalNuevaInspeccion(placa, idOT, km);
    } else {
        if (typeof window.rotToast === 'function') window.rotToast("Cargando módulo de inspecciones...", "bg-info");
        var script = document.createElement('script');
        script.src = '/modulos/mantenimiento/inspecciones/logica.js?v=' + Date.now();
        script.onload = function() {
            if (typeof window.abrirModalNuevaInspeccion === 'function') {
                window.abrirModalNuevaInspeccion(placa, idOT, km);
            } else {
                alert("No se pudo cargar el módulo de inspecciones.");
            }
        };
        script.onerror = function() {
            alert("Error al cargar logica de inspecciones.");
        };
        document.body.appendChild(script);
    }
};

function rotGetNombreUsuario(email) {
    if (!email) return '';
    if (window.dataGlobalUsuarios && Array.isArray(window.dataGlobalUsuarios)) {
        var u = window.dataGlobalUsuarios.find(function(user) { 
            return String(user[0]).toLowerCase() === String(email).toLowerCase() || 
                   String(user[1]).toLowerCase() === String(email).toLowerCase(); 
        });
        if (u && u[1]) return u[1];
    }
    return email.split('@')[0];
}

function rotEscHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}

function rotCapitalize(str) {
    return str.replace(/_/g,' ').replace(/\b\w/g,function(c){ return c.toUpperCase(); });
}

// ── Render dinámico: sección Trabajos ────────────────────────────
function rotRenderSecTrabajos(idOt, esAprobada) {
    var body  = document.getElementById('rot-tr-body');
    var count = document.getElementById('rot-tr-count');
    if (!body) return;
    var lista = window.rotOtTrabajosActivos;
    if (count) count.textContent = lista.length;

    var costoTotal = lista
        .filter(function(t) { return t.estado === 'Aprobado'; })
        .reduce(function(s, t) {
            var d2 = {}; try { d2 = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); } catch(e) {}
            return s + parseFloat(d2.costo || 0);
        }, 0);

    var html = '';
    if (!lista.length) {
        html += '<div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;">No hay trabajos registrados</div>';
    } else {
        lista.forEach(function(t) {
            var det2 = {};
            try { det2 = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); } catch(e) {}
            var bdg = t.estado === 'Aprobado'
                ? '<span style="background:rgba(22,163,74,0.12);color:#16a34a;border-radius:12px;padding:2px 8px;font-size:0.68rem;font-weight:700;">Aprobado</span>'
                : '<span style="background:rgba(217,119,6,0.12);color:#d97706;border-radius:12px;padding:2px 8px;font-size:0.68rem;font-weight:700;">Pendiente</span>';
            var fecIni = t.fecha_trabajo ? String(t.fecha_trabajo).replace('T',' ').slice(0,16) : '';
            var fecFin = t.fecha_salida  ? String(t.fecha_salida).replace('T',' ').slice(0,16)  : '';
            var ticketDisplay = rotEscHtml(String(t.ticket_visita || ''));
            var jobId = rotEscHtml(String(t.id_ot || t.ticket_visita || t.id || ''));
            html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.81rem;cursor:pointer;" onclick="window.rotEditarTrabajo(\'' + jobId + '\',\'' + rotEscHtml(idOt) + '\')">'
                  + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">'
                  + '<div><span style="font-weight:700;color:var(--primary,#5865F2);font-size:0.72rem;">' + ticketDisplay + '</span> ' + bdg + '</div>'
                  + (det2.costo ? '<span style="font-weight:700;color:#16a34a;font-size:0.78rem;">S/' + parseFloat(det2.costo).toFixed(2) + '</span>' : '')
                  + '</div>'
                  + '<div style="color:var(--text);margin-top:3px;">' + rotEscHtml(t.trabajo_realizado || '—') + '</div>'
                  + (det2.personal ? '<div style="font-size:0.75rem;color:var(--subtext);margin-top:2px;"><i class="bi bi-person me-1"></i>' + rotEscHtml(det2.personal) + '</div>' : '')
                  + ((fecIni || fecFin) ? '<div style="font-size:0.75rem;color:var(--subtext);margin-top:1px;"><i class="bi bi-calendar me-1"></i>' + fecIni + (fecFin ? ' â†’ ' + fecFin : '') + '</div>' : '')
                  + '<div style="font-size:0.7rem;color:var(--primary,#5865F2);margin-top:3px;opacity:0.7;">Clic para editar</div>'
                  + '</div>';
        });
        if (costoTotal > 0) {
            html += '<div style="padding:8px 12px;font-size:0.82rem;font-weight:700;text-align:right;color:#16a34a;">Total aprobado: S/' + costoTotal.toFixed(2) + '</div>';
        }
    }
    body.innerHTML = html;
}

// ── Render dinámico: sección Inspecciones ──────────────────────────
function rotRenderSecInspecciones(idOt) {
    var body = document.getElementById('rot-insp-body');
    if (!body) return;
    var lista = window.rotOtInspeccionesActivas || [];
    var html = '';
    if (!lista.length) {
        html += '<div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;">No hay inspecciones registradas</div>';
    } else {
        lista.forEach(function(i) {
            var fIngreso = String(i.fecha_ingreso || '').split('T')[0];
            html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.81rem;display:flex;justify-content:space-between;align-items:center;">'
                  + '<div>'
                  + '<div style="font-weight:700;color:var(--primary,#5865F2);font-size:0.75rem;">' + rotEscHtml(i.id) + '</div>'
                  + '<div style="color:var(--subtext);font-size:0.7rem;">' + fIngreso + ' â€¢ KM: ' + (i.km_tablero || 0) + '</div>'
                  + '</div>'
                  + '<button class="btn btn-sm btn-outline-secondary" style="padding:1px 8px;font-size:0.7rem;border-radius:12px;" onclick="window.rotAbrirTabInspeccion(\'' + rotEscHtml(i.id) + '\')"><i class="bi bi-eye"></i> Ver</button>'
                  + '</div>';
        });
    }
    body.innerHTML = html;
}

window.rotAbrirTabInspeccion = function(idInsp) {
    if (typeof window.verDetalleInspeccion === 'function') {
        window.verDetalleInspeccion(idInsp);
    } else {
        if (typeof window.rotToast === 'function') window.rotToast("Cargando visor...", "bg-info");
        let script = document.createElement('script');
        script.src = '/modulos/mantenimiento/inspecciones/logica.js?v=' + Date.now();
        script.onload = function() {
            let intentos = 0;
            let checkInterval = setInterval(function() {
                intentos++;
                if (typeof window.verDetalleInspeccion === 'function') {
                    clearInterval(checkInterval);
                    window.verDetalleInspeccion(idInsp);
                } else if (intentos > 40) {
                    clearInterval(checkInterval);
                    alert('No se pudo cargar el visor de inspecciones.');
                }
            }, 50);
        };
        script.onerror = function() {
            alert('Error al cargar la lógica de inspecciones.');
        };
        document.body.appendChild(script);
    }
};

// ── Render dinámico: sección Inspección de Neumáticos ──────────────
function rotRenderSecNeumaticos(idOt) {
    var body = document.getElementById('rot-neu-body');
    var count = document.getElementById('rot-neu-count');
    if (!body) return;

    var lista = window.rotOtNeumaticosActivos || [];
    if (count) count.textContent = lista.length;

    var html = '';
    if (!lista.length) {
        html += '<div class="p-3 text-center text-muted small">No hay inspecciones de neumáticos registradas para esta OT.</div>';
    } else {
        lista.forEach(function(item) {
            var f = String(item.fecha_inspeccion || '').split('T')[0];
            var criticasBadge = item.llantas_criticas > 0 
                ? '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2 py-1 rounded-pill small ms-2"><i class="bi bi-exclamation-triangle-fill me-1"></i>' + item.llantas_criticas + ' Críticas</span>' 
                : '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1 rounded-pill small ms-2"><i class="bi bi-check-circle-fill me-1"></i>Óptimas</span>';
            
            html += `
                <div class="d-flex align-items-center justify-content-between p-2 mb-2 rounded-3 border bg-light" style="font-size:0.8rem; border-color: var(--border, #e2e8f0) !important;">
                    <div>
                        <div class="fw-bold text-dark d-flex align-items-center">
                            <span class="text-primary fw-bold me-2">${rotEscHtml(item.id_inspeccion)}</span>
                            ${criticasBadge}
                        </div>
                        <div class="text-muted small mt-1">
                            <span><i class="bi bi-calendar3 me-1"></i>${f}</span> • 
                            <span><i class="bi bi-speedometer2 mx-1"></i>${Number(item.km_vehiculo||0).toLocaleString()} KM</span> • 
                            <span><i class="bi bi-disc mx-1"></i>${item.total_llantas || 0} Llantas evaluadas</span>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-1">
                        <button class="btn btn-sm btn-outline-danger border-0 p-1 rounded-circle" 
                                onclick="event.stopPropagation(); window.rotEliminarInspeccionNeumatico('${rotEscHtml(item.id_inspeccion)}', '${rotEscHtml(idOt)}')" 
                                title="Eliminar Inspección">
                            <i class="bi bi-trash3-fill fs-6"></i>
                        </button>
                    </div>
                </div>
            `;
        });
    }
    body.innerHTML = html;
}

window.rotEliminarInspeccionNeumatico = function(idInspeccion, idOt) {
    if (!confirm('¿Estás seguro de eliminar esta inspección de neumáticos (' + idInspeccion + ')? Esta acción no se puede deshacer.')) return;
    
    fetch('/api/neumaticos/inspecciones/' + encodeURIComponent(idInspeccion), {
        method: 'DELETE'
    }).then(function(r) { return r.json(); })
      .then(function(res) {
          if (res.ok) {
              if (typeof window.rotToast === 'function') window.rotToast('Inspección eliminada correctamente', 'bg-success');
              else if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Inspección eliminada exitosamente', 'success');
              
              // Actualizar lista local y volver a renderizar
              window.rotOtNeumaticosActivos = (window.rotOtNeumaticosActivos || []).filter(function(x) { return x.id_inspeccion !== idInspeccion; });
              rotRenderSecNeumaticos(idOt);
          } else {
              alert('Error al eliminar: ' + (res.error || 'Error desconocido'));
          }
      }).catch(function(err) {
          console.error(err);
          alert('Error de conexión al eliminar la inspección');
      });
};

window.rotAbrirInspeccionNeumaticosWrapper = function(placa, idOT, km) {
    if (typeof window.rotAbrirInspeccionNeumaticos === 'function') {
        window.rotAbrirInspeccionNeumaticos(placa, idOT, km);
    } else {
        var script = document.createElement('script');
        script.src = '/modulos/mantenimiento/neumaticos/modal_inspeccion.js?v=' + Date.now();
        script.onload = function() {
            if (typeof window.rotAbrirInspeccionNeumaticos === 'function') {
                window.rotAbrirInspeccionNeumaticos(placa, idOT, km);
            }
        };
        document.body.appendChild(script);
    }
};

window.rotRecargarDetalleOT = function(idOT) {
    if (typeof window.rotAbrirDetalle === 'function' && idOT) {
        window.rotAbrirDetalle(idOT);
    }
};

window.rotEditarKm = function(idOT, kmActual) {
    window.rotPromptKm(kmActual, function(newKm) {
        if (newKm === null || isNaN(newKm) || newKm < 0) return;
        fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'editar', km: newKm })
        }).then(function(r) { return r.json(); })
          .then(function(res) {
              if (res.error) alert('Error: ' + res.error);
              else window.rotCargar();
          }).catch(function(e) { alert('Error: ' + e); });
    });
};


function rotRenderSecMateriales(idOt, esAprobada) {
    var body  = document.getElementById('rot-mat-body');
    var count = document.getElementById('rot-mat-count');
    if (!body) return;
    var lista = window.rotOtMaterialesActivos;
    if (count) count.textContent = lista.length;

    var costoTotal = lista
        .filter(function(m) { return m.estado === 'Despachado'; })
        .reduce(function(s, m) { return s + parseFloat(m.total_pen || 0); }, 0);
    var hayPendientes = lista.some(function(m) { return m.estado !== 'Despachado' && m.estado !== 'Anulado'; });

    var html = '';
    if (!lista.length) {
        html += '<div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;">No hay salidas registradas</div>';
    } else {
        lista.forEach(function(m) {
            var badge = m.estado === 'Despachado'
                ? '<span style="background:rgba(22,163,74,0.12);color:#16a34a;border-radius:12px;padding:2px 8px;font-size:0.68rem;font-weight:700;">Despachado</span>'
                : m.estado === 'Anulado'
                ? '<span style="background:rgba(220,38,38,0.1);color:#dc2626;border-radius:12px;padding:2px 8px;font-size:0.68rem;font-weight:700;">Anulado</span>'
                : '<span style="background:rgba(217,119,6,0.12);color:#d97706;border-radius:12px;padding:2px 8px;font-size:0.68rem;font-weight:700;">Pendiente</span>';
            var items = m.items || [];
            var artResumen = items.map(function(it) { return rotEscHtml(it.descripcion || it.inventario_id || '—'); }).join(', ') || '—';
            html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.81rem;">'
                  + '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">'
                  + '<div><span style="font-weight:700;color:var(--text);font-size:0.75rem;">' + rotEscHtml(m.id || '—') + '</span> ' + badge + '</div>'
                  + '<button class="btn btn-sm" style="color:var(--subtext);padding:0 4px;" onclick="event.stopPropagation();window.rotEliminarMaterial(\'' + m.id + '\',\'' + rotEscHtml(idOt) + '\')" title="Eliminar"><i class="bi bi-trash" style="font-size:0.75rem;"></i></button>'
                  + '</div>'
                  + '<div style="color:var(--subtext);margin-top:2px;font-size:0.79rem;">' + artResumen + '</div>'
                  + '<div style="margin-top:2px;"><strong style="color:var(--text);">Total: S/.' + parseFloat(m.total_pen || 0).toFixed(2) + '</strong></div>'
                  + '</div>';
        });
        html += '<div style="padding:8px 12px;font-size:0.82rem;font-weight:700;text-align:right;color:#16a34a;">'
              + 'Total despachado: S/.' + costoTotal.toFixed(2)
              + (hayPendientes ? '<span style="font-size:0.72rem;color:#d97706;margin-left:6px;">(pendientes no incluidos)</span>' : '')
              + '</div>';
    }
    body.innerHTML = html;
}

// ── Agregar Trabajo ───────────────────────────────────────────────
window.rotAgregarTrabajo = function(idOt) {
    var lbl  = document.getElementById('rot-tr-ot-lbl');      if (lbl)  lbl.textContent = idOt;
    var hid  = document.getElementById('rot-tr-ot-id');        if (hid)  hid.value = idOt;
    var hid2 = document.getElementById('rot-tr-ticket-hid');   if (hid2) hid2.value = '';
    var desc = document.getElementById('rot-tr-desc');         if (desc) desc.value = '';
    var cos  = document.getElementById('rot-tr-costo');        if (cos)  cos.value  = '0';
    var hoy  = new Date();
    var localDT = hoy.getFullYear() + '-' +
        String(hoy.getMonth()+1).padStart(2,'0') + '-' +
        String(hoy.getDate()).padStart(2,'0') + 'T' +
        String(hoy.getHours()).padStart(2,'0') + ':' +
        String(hoy.getMinutes()).padStart(2,'0');
    var fi = document.getElementById('rot-tr-fecha-ini'); if (fi) fi.value = localDT;
    var ff = document.getElementById('rot-tr-fecha-fin'); if (ff) ff.value = '';
    var tit = document.getElementById('rot-tr-drawer-titulo'); if (tit) tit.textContent = 'Agregar Trabajo';
    var btnElim = document.getElementById('rot-tr-btn-eliminar'); if (btnElim) btnElim.style.display = 'none';
    rotAbrirSubDrawer('rot-drawer-trabajo');
    rotMsInit('');
};

// ── Editar Trabajo ────────────────────────────────────────────────
window.rotEditarTrabajo = function(idTrabajo, idOt) {
    // idTrabajo es el id del trabajo o ticket_visita
    var t = window.rotOtTrabajosActivos.find(function(x){ return String(x.id_ot || x.ticket_visita || x.id || '') === String(idTrabajo); });
    if (!t) return;
    var det2 = {};
    try { det2 = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); } catch(e) {}

    var lbl  = document.getElementById('rot-tr-ot-lbl');      if (lbl)  lbl.textContent = idOt;
    var hid  = document.getElementById('rot-tr-ot-id');        if (hid)  hid.value = idOt;
    var hid2 = document.getElementById('rot-tr-ticket-hid');   if (hid2) hid2.value = idTrabajo;
    var desc = document.getElementById('rot-tr-desc');         if (desc) desc.value = t.trabajo_realizado || '';
    var cos  = document.getElementById('rot-tr-costo');        if (cos)  cos.value  = det2.costo !== undefined ? det2.costo : '0';

    var toLocalDT = function(iso) {
        if (!iso) return '';
        var s = String(iso);
        return s.indexOf('T') !== -1 ? s.slice(0,16) : s.slice(0,16);
    };
    var fi = document.getElementById('rot-tr-fecha-ini'); if (fi) fi.value = toLocalDT(t.fecha_trabajo || '');
    var ff = document.getElementById('rot-tr-fecha-fin'); if (ff) ff.value = toLocalDT(t.fecha_salida  || '');
    var tit = document.getElementById('rot-tr-drawer-titulo'); if (tit) tit.textContent = 'Editar Trabajo ' + idTrabajo;
    var btnElim = document.getElementById('rot-tr-btn-eliminar'); if (btnElim) btnElim.style.display = '';
    rotAbrirSubDrawer('rot-drawer-trabajo');
    rotMsInit(det2.personal || t.tecnico || '');
};

// ── Guardar Trabajo (nuevo o edición) ────────────────────────────
window.rotGuardarTrabajo = function() {
    var idOt   = ((document.getElementById('rot-tr-ot-id')      || {}).value || '');
    var ticket = ((document.getElementById('rot-tr-ticket-hid') || {}).value || '').trim();
    var desc   = ((document.getElementById('rot-tr-desc')       || {}).value || '').trim();
    var pers   = ((document.getElementById('rot-tr-personal')   || {}).value || '').trim();
    var fIni   = ((document.getElementById('rot-tr-fecha-ini')  || {}).value || '');
    var fFin   = ((document.getElementById('rot-tr-fecha-fin')  || {}).value || '');
    var costo  = parseFloat((document.getElementById('rot-tr-costo')   || {}).value || 0);

    if (!desc) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La descripción es requerida', 'danger'); return; }

    var esEdicion = !!ticket;
    var user = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';

    var url, method, payload;
    if (esEdicion) {
        url     = '/api/ot-trabajos/' + encodeURIComponent(ticket);
        method  = 'PUT';
        payload = { accion: 'editar', trabajo_realizado: desc, fecha_trabajo: fIni || null, fecha_salida: fFin || null, personal: pers, costo: costo };
    } else {
        url     = '/api/ot-trabajos';
        method  = 'POST';
        payload = { ticket_visita: idOt, trabajo_realizado: desc, fecha_trabajo: fIni || null, fecha_salida: fFin || null, creado_por: user, detalles_json: JSON.stringify({ personal: pers, costo: costo }) };
    }

    fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(d) {
        window.rotCerrarSubDrawer('rot-drawer-trabajo');
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta(esEdicion ? 'Trabajo actualizado' : 'Trabajo ' + (d.ticket_visita || '') + ' registrado', 'success');
        }
        fetch('/api/ot-trabajos?id_ot=' + encodeURIComponent(idOt))
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(rows) {
                window.rotOtTrabajosActivos = Array.isArray(rows) ? rows : [];
                var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOt); });
                rotRenderSecTrabajos(idOt, ot ? (ot.estado === 'Aprobada' || ot.estado === 'En Proceso' || ot.estado === 'Pausada') : false);
            }).catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar trabajo', 'danger'); });
};

// ── Multiselect Personal (Agregar/Editar Trabajo) ──────────────────────────
window._rotSeleccionados = [];
window._rotPersonalLista = [];
window._rotPersonalDatos = {};

window.rotMsInit = function(valorActual) {
    window._rotSeleccionados = valorActual ? valorActual.split(',').map(function(n){ return n.trim(); }).filter(Boolean) : [];
    window.rotMsRenderBox();
    var dd = document.getElementById('rot-ms-dropdown'); if (dd) dd.style.display = 'none';
    var s = document.getElementById('rot-ms-search'); if (s) s.value = '';
    var cnt = document.getElementById('rot-ms-count'); if (cnt) cnt.textContent = window._rotSeleccionados.length + ' seleccionados';

    // Cargar inmediatamente desde cache si existe para renderizado instantáneo
    var listaInicial = [];
    if (window._rotPersonalItems && window._rotPersonalItems.length) {
        listaInicial = window._rotPersonalItems.map(function(x){ return x.value || x.label || x; });
    } else if (window.dataGlobalConductores && window.dataGlobalConductores.length) {
        listaInicial = window.dataGlobalConductores.map(function(c){ return (typeof c === 'string') ? c : (c[1] || c.nombre || c.conductor || ''); }).filter(Boolean);
    }
    if (listaInicial.length) {
        window._rotPersonalLista = Array.from(new Set(listaInicial)).sort();
        window.rotMsRenderOptions('');
    }

    // Refrescar lista completa desde el servidor
    Promise.all([
        fetch('/api/taller-personal').then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        fetch('/api/conductores').then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; })
    ]).then(function(results) {
        var tallerPers = Array.isArray(results[0]) ? results[0] : [];
        var conductores = Array.isArray(results[1]) ? results[1] : (results[1].data || []);
        var nombresSet = {};
        var lista = [];
        tallerPers.forEach(function(p) {
            var n = (p.nombre || '').trim();
            if (n && !nombresSet[n.toUpperCase()]) {
                nombresSet[n.toUpperCase()] = true;
                window._rotPersonalDatos[n] = parseFloat(p.costo_hora || 0);
                lista.push(n);
            }
        });
        conductores.forEach(function(p) {
            var n = (p.nombre_completo || p.nombre || '').trim();
            if (n && !nombresSet[n.toUpperCase()]) {
                nombresSet[n.toUpperCase()] = true;
                window._rotPersonalDatos[n] = window._rotPersonalDatos[n] || 0;
                lista.push(n);
            }
        });
        if (lista.length) {
            window._rotPersonalLista = lista.sort();
        }
        window.rotMsRenderOptions('');
        window.rotCalcularCostoAuto();
    });
};

window.rotCalcularCostoAuto = function() {
    var fiEl = document.getElementById('rot-tr-fecha-ini');
    var ffEl = document.getElementById('rot-tr-fecha-fin');
    if (!fiEl || !ffEl) return;
    var fIni = fiEl.value;
    var fFin = ffEl.value;
    if (!fIni || !fFin) return;
    var inicio = new Date(fIni); var fin = new Date(fFin);
    if (fin <= inicio) return;
    var esMinutoLaboral = function(d) {
        var day = d.getDay(); var h = d.getHours();
        if (day === 0) return false;
        if (h < 8) return false;
        if (day >= 1 && day <= 5 && h >= 18) return false;
        if (day === 6 && h >= 14) return false;
        if (day >= 1 && day <= 5 && h === 13) return false;
        return true;
    };
    var minutosNetos = 0; var current = new Date(inicio.getTime());
    while(current < fin) {
        var nextMinute = new Date(current.getTime() + 60000);
        if (nextMinute > fin) {
            var diff = (fin - current) / 60000;
            if (esMinutoLaboral(current)) minutosNetos += diff;
            break;
        } else {
            if (esMinutoLaboral(current)) minutosNetos += 1;
            current = nextMinute;
        }
    }
    var costoHoraTotal = 0;
    window._rotSeleccionados.forEach(function(n) { costoHoraTotal += window._rotPersonalDatos[n] || 0; });
    var total = (minutosNetos / 60) * costoHoraTotal;
    var costoInput = document.getElementById('rot-tr-costo');
    if (costoInput && (!costoInput.value || parseFloat(costoInput.value) === 0)) costoInput.value = total.toFixed(2);
};

window.rotMsToggle = function() {
    var dd = document.getElementById('rot-ms-dropdown');
    var box = document.getElementById('rot-ms-box');
    if (!dd) return;
    var isOpen = dd.style.display !== 'none';
    if (isOpen) {
        dd.style.display = 'none';
        if (box) box.style.borderColor = '#cbd5e1';
    } else {
        dd.style.display = 'block';
        if (box) box.style.borderColor = '#3b82f6';
        var s = document.getElementById('rot-ms-search');
        if (s) { s.value = ''; s.focus(); }
        window.rotMsRenderOptions('');
    }
};

window.rotMsFiltrar = function(q) { window.rotMsRenderOptions(q || ''); };

window.rotMsRenderOptions = function(query) {
    var cont = document.getElementById('rot-ms-options');
    if (!cont) return;
    var q = (query || '').toLowerCase();
    var html = '';
    var lista = window._rotPersonalLista || [];
    var count = 0;
    lista.forEach(function(n) {
        if (q && n.toLowerCase().indexOf(q) === -1) return;
        count++;
        var chk = window._rotSeleccionados.indexOf(n) !== -1;
        var bg = chk ? '#eff6ff' : 'transparent';
        var fw = chk ? '700' : '500';
        var nEsc = window.rotEscHtml(n).replace(/'/g, "\\'");
        html += `
            <div onclick="window.rotMsToggleItem('${nEsc}')" 
                 style="padding:8px 12px; cursor:pointer; font-size:.82rem; background:${bg}; font-weight:${fw}; display:flex; align-items:center; justify-content:space-between; transition:background .15s; border-bottom:1px solid #f1f5f9;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="width:18px; height:18px; border:1.5px solid ${chk ? '#2563eb' : '#94a3b8'}; border-radius:4px; display:flex; align-items:center; justify-content:center; background:${chk ? '#2563eb' : 'transparent'}; flex-shrink:0;">
                        ${chk ? '<i class="bi bi-check-lg" style="color:#fff; font-size:.75rem;"></i>' : ''}
                    </div>
                    <span style="color:#1e293b; text-transform:uppercase;">${window.rotEscHtml(n)}</span>
                </div>
                ${chk ? '<span class="badge bg-primary bg-opacity-10 text-primary rounded-pill px-2 py-0" style="font-size:0.65rem;">Asignado</span>' : ''}
            </div>
        `;
    });
    if (!count) {
        html = '<div style="padding:16px 12px; font-size:.8rem; color:#94a3b8; text-align:center;"><i class="bi bi-person-x fs-5 d-block mb-1"></i>No se encontraron técnicos</div>';
    }
    cont.innerHTML = html;
};

window.rotMsToggleItem = function(n) {
    var idx = window._rotSeleccionados.indexOf(n);
    if (idx === -1) {
        window._rotSeleccionados.push(n);
    } else {
        window._rotSeleccionados.splice(idx, 1);
    }
    var searchVal = document.getElementById('rot-ms-search') ? document.getElementById('rot-ms-search').value : '';
    window.rotMsRenderOptions(searchVal);
    window.rotMsRenderBox();
    window.rotCalcularCostoAuto();
};

window.rotMsLimpiar = function() {
    window._rotSeleccionados = [];
    window.rotMsRenderOptions('');
    window.rotMsRenderBox();
    window.rotCalcularCostoAuto();
};

window.rotMsRenderBox = function() {
    var box = document.getElementById('rot-ms-box');
    if (!box) return;
    var h = document.getElementById('rot-tr-personal');
    if (h) h.value = window._rotSeleccionados.join(', ');
    var cnt = document.getElementById('rot-ms-count');
    if (cnt) cnt.textContent = window._rotSeleccionados.length + ' seleccionados';
    
    if (window._rotSeleccionados.length === 0) {
        box.innerHTML = '<span style="color:#94a3b8; font-size:.82rem;">Seleccionar técnico(s)...</span>';
    } else {
        var html = '';
        window._rotSeleccionados.forEach(function(n) {
            var nEsc = window.rotEscHtml(n).replace(/'/g, "\\'");
            html += `
                <span class="badge bg-light text-dark border d-inline-flex align-items-center gap-1 text-uppercase fw-bold shadow-2xs" 
                      style="font-size:0.72rem; padding:3px 8px; border-radius:6px;">
                    <i class="bi bi-person-fill text-secondary"></i> ${window.rotEscHtml(n)}
                    <i class="bi bi-x-lg text-danger ms-1" onclick="event.stopPropagation(); window.rotMsToggleItem('${nEsc}')" style="cursor:pointer; font-size:.7rem;"></i>
                </span>
            `;
        });
        box.innerHTML = html;
    }
};

// Cerrar dropdown al hacer clic fuera
document.addEventListener('click', function(e) {
    var wrapper = document.getElementById('rot-ms-wrapper');
    var dd = document.getElementById('rot-ms-dropdown');
    if (wrapper && dd && dd.style.display !== 'none' && !wrapper.contains(e.target)) {
        dd.style.display = 'none';
        var box = document.getElementById('rot-ms-box');
        if (box) box.style.borderColor = '#cbd5e1';
    }
});

// ── Eliminar Trabajo ──────────────────────────────────────────────
window.rotEliminarTrabajo = function() {
    var ticket = ((document.getElementById('rot-tr-ticket-hid') || {}).value || '').trim();
    var idOt   = ((document.getElementById('rot-tr-ot-id')      || {}).value || '');
    if (!ticket) return;
    rotConfirmModerno('Eliminar Trabajo', '¿Eliminar el trabajo ' + ticket + '? Esta acción no se puede deshacer.', function() {
        fetch('/api/ot-trabajos/' + encodeURIComponent(ticket), { method: 'DELETE' })
        .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function() {
            window.rotCerrarSubDrawer('rot-drawer-trabajo');
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Trabajo eliminado', 'success');
            fetch('/api/ot-trabajos?id_ot=' + encodeURIComponent(idOt))
                .then(function(r){ return r.ok ? r.json() : []; })
                .then(function(rows) {
                    window.rotOtTrabajosActivos = Array.isArray(rows) ? rows : [];
                    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOt); });
                    rotRenderSecTrabajos(idOt, ot ? (ot.estado === 'Aprobada' || ot.estado === 'En Proceso' || ot.estado === 'Pausada') : false);
                }).catch(function(){});
        })
        .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar trabajo', 'danger'); });
    }, 'danger');
};

// ── Agregar Salida (material) — form rico multi-artículo ──────────
window.rotAgregarSalida = function(idOt) {
    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOt); });
    var estadoOT = ot ? (ot.estado || 'Pendiente') : 'Pendiente';
    if (estadoOT === 'Anulado') {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La OT está cerrada. No se pueden agregar salidas de material.', 'warning');
        return;
    }
    if (estadoOT === 'Pendiente') {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La OT debe estar iniciada para registrar salidas de material.', 'warning');
        return;
    }
    var lbl = document.getElementById('rot-mat-ot-lbl'); if (lbl) lbl.textContent = 'OT: ' + idOt;
    var hid = document.getElementById('rot-mat-ot-id');  if (hid) hid.value = idOt;
    var otObj = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOt); });
    var placa = otObj ? (otObj.placa || '') : '';
    
    var vis = document.getElementById('rot-mat-ot-vis');
    if (vis) vis.value = placa ? (idOt + ' — ' + placa) : idOt;

    // Pre-llenar fecha de hoy
    var hoy = new Date();
    var fechaHoy = hoy.getFullYear() + '-' +
        String(hoy.getMonth()+1).padStart(2,'0') + '-' +
        String(hoy.getDate()).padStart(2,'0');
    var fecEl = document.getElementById('rot-mat-fecha'); if (fecEl) fecEl.value = fechaHoy;

    // Pre-llenar placa desde la OT activa
    var placaEl = document.getElementById('rot-mat-placa'); if (placaEl) placaEl.value = placa;
    if (typeof window._cbSet === 'function') { window._cbSet('rot-mat-placa', placa.toUpperCase(), placa.toUpperCase()); }

    var tipoEl = document.getElementById('rot-mat-tipo'); if (tipoEl) tipoEl.value = 'Vehiculo';
    var solic = document.getElementById('rot-mat-solicitante'); if (solic) solic.value = '';
    var obs   = document.getElementById('rot-mat-obs');         if (obs)   obs.value   = '';

    // Limpiar items
    var tb = document.getElementById('rot-mat-items-tbody'); if (tb) tb.innerHTML = '';
    window._rotMatIdx = 0;
    var tot = document.getElementById('rot-mat-items-total'); if (tot) tot.textContent = 'S/. 0.00';
    _rotAgregarItemMat();

    // Cargar inventario y placas si no están cargados
    if (!window._rotInvData.length) {
        fetch('/api/almacen/inventario')
            .then(function(r) { return r.json(); })
            .then(function(d) {
                window._rotInvData = d || [];
                var dl = document.getElementById('rot-mat-inv-list');
                if (dl) dl.innerHTML = (d || []).map(function(a) {
                    return '<option value="' + rotEscHtml(a.id + ' — ' + a.descripcion) + '">';
                }).join('');
            })
            .catch(function() {});
    }
    fetch('/api/placas-lista')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(d) {
            var lista = (Array.isArray(d) ? d : []).map(function(p){ return (p.placa || String(p) || '').toUpperCase(); }).filter(Boolean).sort();
            if (window._cbInit) window._cbInit('rot-mat-placa', lista);
        })
        .catch(function() {});
    fetch('/api/conductores-lista')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(d) {
            var dl = document.getElementById('rot-mat-list-personal');
            if (dl) dl.innerHTML = (Array.isArray(d) ? d : []).map(function(c) {
                return '<option value="' + rotEscHtml(c.nombre || '') + '">';
            }).join('');
        })
        .catch(function() {});

    rotAbrirSubDrawer('rot-drawer-material');
};

// ── Item helpers para el form de materiales ───────────────────────
window._rotAgregarItemMat = function() {
    var tbody = document.getElementById('rot-mat-items-tbody');
    if (!tbody) return;
    var idx = window._rotMatIdx++;
    var tr = document.createElement('tr');
    tr.id = 'rot-mat-item-' + idx;
    tr.innerHTML = `
        <td style="padding:6px 8px;">
            <div style="display:flex;gap:4px;align-items:center;">
                <input type="text" class="form-control form-control-sm rot-mat-item-desc bg-white fw-medium" list="rot-mat-inv-list" placeholder="Buscar artículo…" 
                    data-idx="${idx}" oninput="window._rotBuscarArtMat(this, ${idx})" style="border-radius:8px; font-size:0.8rem;">
                <button type="button" class="btn btn-sm btn-light border text-primary shadow-2xs" style="flex-shrink:0; padding:3px 8px; border-radius:8px;" 
                    onclick="window._rotAbrirQR(${idx})" title="Escanear código de barras o QR">
                    <i class="bi bi-upc-scan"></i>
                </button>
            </div>
            <input type="hidden" class="rot-mat-item-inv-id" data-idx="${idx}">
            <input type="hidden" class="rot-mat-item-stock" data-idx="${idx}" value="">
            <div class="rot-mat-item-stock-lbl" data-idx="${idx}" style="font-size:0.71rem;margin-top:2px;display:none;"></div>
        </td>
        <td style="padding:6px 8px; width:75px;">
            <input type="number" class="form-control form-control-sm rot-mat-item-cant bg-white fw-bold text-center" data-idx="${idx}" value="1" min="0.001" step="0.001" oninput="window._rotCalcItemMat(${idx})" style="border-radius:8px; font-size:0.8rem;">
        </td>
        <td style="padding:6px 8px; width:105px;">
            <input type="number" class="form-control form-control-sm rot-mat-item-cu bg-white fw-semibold" data-idx="${idx}" value="0" min="0" step="0.01" oninput="window._rotCalcItemMat(${idx})" style="border-radius:8px; font-size:0.8rem;">
        </td>
        <td style="padding:6px 8px; width:100px;">
            <input type="number" class="form-control form-control-sm rot-mat-item-imp bg-light fw-bold text-success" data-idx="${idx}" value="0" readonly style="border-radius:8px; font-size:0.8rem;">
        </td>
        <td style="padding:6px 8px; width:38px; text-align:center;">
            <button type="button" class="btn btn-sm btn-light border-0 text-danger rounded-circle p-1" onclick="window._rotQuitarItemMat(${idx})" title="Eliminar fila">
                <i class="bi bi-x-lg" style="font-size:0.75rem;"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
};

window._rotQrTargetIdx = window._rotQrTargetIdx || null;

window._rotAbrirQR = function(idx) {
    window._rotQrTargetIdx = idx;
    if (window._abrirEscaner) {
        window._abrirEscaner(function(valor) {
            window._rotSeleccionarItemPorQR(valor, window._rotQrTargetIdx);
        }, 'Escanear Artículo');
    } else {
        alert("El módulo de escáner no está disponible.");
    }
};

window._rotSeleccionarItemPorQR = function(valor, idx) {
    var item = (window._rotInvData || []).find(function(d) {
        return String(d.id).trim() === valor.trim() ||
               (d.codigo_barras && d.codigo_barras.trim() === valor.trim());
    });
    if (!item) {
        if (typeof window.rotToast === 'function') window.rotToast('Artículo no encontrado: ' + valor, 'bg-danger');
        else alert('Artículo no encontrado: ' + valor);
        return;
    }
    var descEl = document.querySelector('.rot-mat-item-desc[data-idx="' + idx + '"]');
    var hidEl  = document.querySelector('.rot-mat-item-inv-id[data-idx="' + idx + '"]');
    var cuEl   = document.querySelector('.rot-mat-item-cu[data-idx="' + idx + '"]');
    if (descEl) descEl.value = item.id + ' — ' + (item.descripcion || '');
    if (hidEl) hidEl.value = item.id;
    if (cuEl && item.costo) cuEl.value = item.costo;
    
    var stockEl = document.querySelector('.rot-mat-item-stock[data-idx="' + idx + '"]');
    var lblEl   = document.querySelector('.rot-mat-item-stock-lbl[data-idx="' + idx + '"]');
    if (stockEl) stockEl.value = item.stock || 0;
    if (lblEl) {
        lblEl.textContent = 'Stock: ' + (item.stock || 0);
        lblEl.style.display = 'block';
        lblEl.style.color = (item.stock > 0) ? '#16a34a' : '#dc2626';
    }
    
    window._rotCalcItemMat(idx);
    if (typeof window.rotToast === 'function') window.rotToast('Artículo agregado correctamente', 'bg-success');
};

window._rotBuscarArtMat = function(input, idx) {
    var val = input.value || '';
    var invId = val.split(' — ')[0].trim();
    var item = (window._rotInvData || []).find(function(d) { return d.id === invId; });
    var stockEl = document.querySelector('.rot-mat-item-stock[data-idx="' + idx + '"]');
    var lblEl   = document.querySelector('.rot-mat-item-stock-lbl[data-idx="' + idx + '"]');
    if (item) {
        var hidEl = document.querySelector('.rot-mat-item-inv-id[data-idx="' + idx + '"]');
        if (hidEl) hidEl.value = item.id;
        var cuEl = document.querySelector('.rot-mat-item-cu[data-idx="' + idx + '"]');
        if (cuEl) { cuEl.value = parseFloat(item.costo_referencial || 0).toFixed(2); window._rotCalcItemMat(idx); }
        var stock = parseFloat(item.stock_actual != null ? item.stock_actual : -1);
        if (stockEl) stockEl.value = stock;
        if (lblEl) {
            lblEl.style.display = '';
            if (stock <= 0) {
                lblEl.innerHTML = '<span style="color:#dc2626;font-weight:700;">âš  Sin stock disponible</span>';
            } else {
                lblEl.innerHTML = '<span style="color:#16a34a;">Stock disponible: <strong>' + stock + '</strong> ' + (item.unidad || 'und') + '</span>';
            }
        }
    } else {
        if (stockEl) stockEl.value = '';
        if (lblEl) lblEl.style.display = 'none';
    }
};

window._rotCalcItemMat = function(idx) {
    var cant = parseFloat((document.querySelector('.rot-mat-item-cant[data-idx="' + idx + '"]') || {}).value) || 0;
    var cu   = parseFloat((document.querySelector('.rot-mat-item-cu[data-idx="' + idx + '"]')   || {}).value) || 0;
    var impEl = document.querySelector('.rot-mat-item-imp[data-idx="' + idx + '"]');
    if (impEl) impEl.value = (cant * cu).toFixed(2);
    _rotActualizarTotalMat();
};

window._rotQuitarItemMat = function(idx) {
    var tr = document.getElementById('rot-mat-item-' + idx);
    if (tr) tr.remove();
    _rotActualizarTotalMat();
};

function _rotActualizarTotalMat() {
    var imps = document.querySelectorAll('.rot-mat-item-imp');
    var total = 0;
    imps.forEach(function(el) { total += parseFloat(el.value) || 0; });
    var el = document.getElementById('rot-mat-items-total');
    if (el) el.textContent = 'S/. ' + total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Guardar Material ──────────────────────────────────────────────
window.rotGuardarMaterial = function() {
    var idOt  = ((document.getElementById('rot-mat-ot-id')      || {}).value || '');
    var fecha = ((document.getElementById('rot-mat-fecha')       || {}).value || '');
    var tipo  = ((document.getElementById('rot-mat-tipo')        || {}).value || 'Vehiculo');
    var placa = ((document.getElementById('rot-mat-placa')       || {}).value || '').trim();
    var solic = ((document.getElementById('rot-mat-solicitante') || {}).value || '').trim();
    var obs   = ((document.getElementById('rot-mat-obs')         || {}).value || '').trim();

    // Recoger items
    var descs = document.querySelectorAll('.rot-mat-item-desc');
    var cants = document.querySelectorAll('.rot-mat-item-cant');
    var cus   = document.querySelectorAll('.rot-mat-item-cu');
    var imps  = document.querySelectorAll('.rot-mat-item-imp');
    var invIds = document.querySelectorAll('.rot-mat-item-inv-id');
    var items = [];
    for (var i = 0; i < cants.length; i++) {
        var desc = descs[i] ? descs[i].value.trim() : '';
        if (!desc) continue;
        var cant = parseFloat(cants[i].value) || 0;
        var cu   = parseFloat(cus[i].value)   || 0;
        var imp  = parseFloat(imps[i].value)  || cant * cu;
        var invId = (invIds[i] && invIds[i].value) ? invIds[i].value : null;
        if (cant <= 0) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Cantidad inválida en fila ' + (i+1), 'danger'); return; }
        items.push({ inventario_id: invId, descripcion: desc, cantidad: cant, costo_unitario: cu, importe: imp });
    }
    if (!items.length) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Agrega al menos un artículo', 'danger'); return; }

    // Validar stock antes de guardar
    var sinStock = [];
    items.forEach(function(it) {
        var invIds = document.querySelectorAll('.rot-mat-item-inv-id');
        var descs  = document.querySelectorAll('.rot-mat-item-desc');
        // buscar el inv-id que corresponde a este item por descripcion
        var invId = '';
        for (var j = 0; j < descs.length; j++) {
            if ((descs[j].value || '').trim() === it.descripcion) {
                invId = invIds[j] ? invIds[j].value : '';
                break;
            }
        }
        if (invId) {
            var inv = (window._rotInvData || []).find(function(d) { return d.id === invId; });
            if (inv) {
                var stockDisp = parseFloat(inv.stock_actual != null ? inv.stock_actual : 0);
                if (it.cantidad > stockDisp) {
                    sinStock.push('"' + it.descripcion + '" — solicitado: ' + it.cantidad + ', disponible: ' + (stockDisp <= 0 ? 'Sin stock' : stockDisp));
                }
            }
        }
    });
    if (sinStock.length) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Stock insuficiente:\nâ€¢ ' + sinStock.join('\nâ€¢ '), 'danger');
        }
        return;
    }

    var user = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
    fetch('/api/ot-materiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ticket_ot:    idOt,
            fecha:        fecha || null,
            tipo_orden:   ((document.getElementById('rot-mat-tipo-orden') || {}).value || 'Orden de Salida'),
            tipo_destino: tipo,
            placa:        placa,
            responsable:  solic,
            observaciones: obs,
            creado_por:   user,
            items:        items
        })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(d) {
        window.rotCerrarSubDrawer('rot-drawer-material');
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Solicitud ' + (d.id || '') + ' registrada', 'success');
        fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOt))
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(rows) {
                window.rotOtMaterialesActivos = Array.isArray(rows) ? rows : [];
                var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOt); });
                rotRenderSecMateriales(idOt, ot ? (ot.estado === 'Aprobada' || ot.estado === 'En Proceso' || ot.estado === 'Pausada') : false);
            }).catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar solicitud', 'danger'); });
};

// ── Eliminar Material ─────────────────────────────────────────────
window.rotEliminarMaterial = function(idSolicitud, idOt) {
    rotConfirmModerno('Eliminar Solicitud', '¿Eliminar esta solicitud de material?', function() {
        fetch('/api/ot-materiales/' + encodeURIComponent(idSolicitud), { method: 'DELETE' })
        .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function() {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Solicitud eliminada', 'success');
            fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOt))
                .then(function(r){ return r.ok ? r.json() : []; })
                .then(function(rows) {
                    window.rotOtMaterialesActivos = Array.isArray(rows) ? rows : [];
                    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOt); });
                    rotRenderSecMateriales(idOt, ot ? (ot.estado === 'Aprobada' || ot.estado === 'En Proceso' || ot.estado === 'Pausada') : false);
                }).catch(function(){});
        })
        .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar', 'danger'); });
    }, 'danger');
};

// ── Sub-drawer helpers ────────────────────────────────────────────
window.rotAbrirSubDrawer = function(id) {
    var d = document.getElementById(id);
    if (d) {
        if (d.parentElement !== document.body) {
            document.body.appendChild(d);
        }
        d.style.zIndex = '1150';
        d.classList.add('open');
    }
};

window.rotCerrarSubDrawer = function(drawerId) {
    var d = document.getElementById(drawerId);
    if (d) d.classList.remove('open');
};




// ── Render sección Backlog ────────────────────────────────────────
function rotRenderSecBacklog(items, idOT) {
    var body  = document.getElementById('rot-bkg-body');
    var count = document.getElementById('rot-bkg-count');
    if (!body) return;

    items = items.filter(function(b) {
        return b.estado === 'Pendiente' || String(b.ticket_ot) === String(idOT);
    });

    if (count) count.textContent = items.length;

    if (!items.length) {
        body.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;">No hay pendientes ni realizados relacionados a esta unidad.</div>';
        return;
    }

    var html = '';
    items.forEach(function(b) {
        var isPendiente = b.estado === 'Pendiente';
        var badgeHtml = isPendiente
            ? ' <span style="background:#fff7ed;color:#ea580c;padding:1px 6px;border-radius:10px;font-size:0.65rem;font-weight:700;margin-left:4px;border:1px solid #ffedd5;">Pendiente</span>'
            : ' <span style="background:#f0fdf4;color:#16a34a;padding:1px 6px;border-radius:10px;font-size:0.65rem;font-weight:700;margin-left:4px;border:1px solid #dcfce7;">Realizado</span>';
        
        html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.81rem;">'
              + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">'
              + '<div><span style="font-weight:700;font-size:0.72rem;color:#d97706;">' + rotEscHtml(b.backlog_id || String(b.id)) + '</span>'
              + badgeHtml
              + (b.tema ? ' <span style="font-size:0.72rem;color:var(--subtext);margin-left:4px;">' + rotEscHtml(b.tema) + '</span>' : '') + '</div>'
              + '<div style="display:flex;gap:4px;">'
              + (isPendiente ? '<button class="btn btn-sm btn-outline-success" style="padding:1px 7px;font-size:0.7rem;font-weight:600;" '
                             + 'onclick="event.stopPropagation();window.rotMarcarBacklogRealizado(' + b.id + ',this)" title="Marcar como Realizado"><i class="bi bi-check-lg"></i> Marcar Realizado</button>' : '')
              + '<button class="btn btn-sm" style="padding:1px 6px;color:var(--subtext);font-size:0.78rem;" '
              + 'onclick="event.stopPropagation();window.rotEliminarBacklogItem(' + b.id + ',this)" title="Eliminar"><i class="bi bi-trash"></i></button>'
              + '</div>'
              + '</div>'
              + '<div style="color:var(--text);margin-top:3px;">' + rotEscHtml(b.tarea || '—') + '</div>'
              + (b.reportado_por ? '<div style="font-size:0.73rem;color:var(--subtext);margin-top:2px;"><i class="bi bi-person me-1"></i>' + rotEscHtml(b.reportado_por) + '</div>' : '')
              + '</div>';
    });
    body.innerHTML = html;
}

// ── Eliminar backlog item ─────────────────────────────────────────
window.rotEliminarBacklogItem = function(id, btn) {
    if (!confirm('¿Eliminar este mantenimiento pendiente?')) return;
    if (btn) btn.disabled = true;
    fetch('/api/ot-backlog/' + id, { method: 'DELETE' })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Pendiente eliminado', 'success');
        if (btn) {
            var row = btn.closest ? btn.closest('[style*="border-bottom"]') : btn.parentNode.parentNode.parentNode;
            if (row && row.parentNode) row.parentNode.removeChild(row);
            var count = document.getElementById('rot-bkg-count');
            if (count) count.textContent = Math.max(0, (parseInt(count.textContent) || 1) - 1);
        }
    })
    .catch(function() {
        if (btn) btn.disabled = false;
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar', 'danger');
    });
};

// ── Abrir sub-drawer agregar backlog ──────────────────────────────
window.rotAbrirAgregarBacklog = function(placa, ticket_ot, km_ot) {
    var lbl = document.getElementById('rot-bkg-placa-lbl'); if (lbl) lbl.textContent = 'Placa: ' + placa;
    var hid = document.getElementById('rot-bkg-placa-hid'); if (hid) hid.value = placa;
    var hidOt = document.getElementById('rot-bkg-ticket-ot'); if (hidOt) hidOt.value = ticket_ot || '';
    var km = document.getElementById('rot-bkg-km');           if (km) km.value = km_ot || '';
    var tema = document.getElementById('rot-bkg-tema');       if (tema) tema.value = '';
    var tarea = document.getElementById('rot-bkg-tarea');     if (tarea) tarea.value = '';
    var rep   = document.getElementById('rot-bkg-reportado-por'); if (rep) rep.value = '';
    rotAbrirSubDrawer('rot-drawer-backlog');
};

// ── Guardar nuevo backlog ─────────────────────────────────────────
window.rotGuardarBacklog = function() {
    var placa = ((document.getElementById('rot-bkg-placa-hid')     || {}).value || '').trim();
    var ticket_ot = ((document.getElementById('rot-bkg-ticket-ot') || {}).value || '').trim();
    var km    = ((document.getElementById('rot-bkg-km')            || {}).value || '').trim();
    var tema  = ((document.getElementById('rot-bkg-tema')          || {}).value || '').trim();
    var tarea = ((document.getElementById('rot-bkg-tarea')         || {}).value || '').trim();
    var rep   = ((document.getElementById('rot-bkg-reportado-por') || {}).value || '').trim();

    if (!placa || !tarea) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La descripción es requerida', 'danger'); return; }
    var user = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
    fetch('/api/ot-backlog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: placa, ticket_ot: ticket_ot, km: km, tema: tema, tarea: tarea, reportado_por: rep || user, estado: 'Pendiente', creado_por: user })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        window.rotCerrarSubDrawer('rot-drawer-backlog');
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Mantenimiento pendiente agregado', 'success');
        // Recargar backlog
        fetch('/api/ot-backlog?placa=' + encodeURIComponent(placa))
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(items) { rotRenderSecBacklog(Array.isArray(items) ? items : [], ticket_ot); })
            .catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al agregar pendiente', 'danger'); });
};
window.rotMarcarBacklogRealizado = function(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    fetch('/api/ot-backlog/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'Realizado' })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Backlog marcado como Realizado', 'success');
        if (window.rotCurrentOt && window.rotCurrentOt.placa) {
             fetch('/api/ot-backlog?placa=' + encodeURIComponent(window.rotCurrentOt.placa))
                 .then(function(r){ return r.ok ? r.json() : []; })
                 .then(function(items) { rotRenderSecBacklog(Array.isArray(items) ? items : [], window.rotCurrentOt.id_ot); })
                 .catch(function(){});
        }
    })
    .catch(function() {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i> Marcar Realizado'; }
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al actualizar el backlog', 'danger');
    });
};

// ── Editar OT — abrir sub-drawer ─────────────────────────────────
var ROT_SUBTIPOS = {
    'Preventivo': ['Inspección Pre-PM','Campaña','Limpieza Integral','Rutina','Programado','Oportuno'],
    'Correctivo': ['Falla','Varado','Programado','Garantía','Accidentabilidad','Mala Operación'],
    'Predictivo': ['Por condición','Prueba'],
    'Proactivo':  ['Mejora'],
    'Servicio':   ['Stock','Taller']
};

window._rotEotTrabajos = [];
window._rotEotTrabajosCount = 0;

window.rotAsegurarPersonalItems = function(callback) {
    if (window._rotPersonalItems && window._rotPersonalItems.length > 0) {
        if (typeof callback === 'function') callback();
        return;
    }

    var list = [];
    if (window.dataGlobalConductores && window.dataGlobalConductores.length) {
        list = window.dataGlobalConductores.map(function(c) {
            return (typeof c === 'string') ? c : (c[1] || c.nombre || c.conductor || '');
        }).filter(Boolean);
    } else if (window._genOT_Tecnicos && window._genOT_Tecnicos.length) {
        list = window._genOT_Tecnicos;
    }

    if (list.length > 0) {
        window._rotPersonalItems = Array.from(new Set(list)).sort().map(function(p) { return { value: p, label: p }; });
        if (typeof callback === 'function') callback();
        return;
    }

    // Refrescar desde servidores
    Promise.all([
        fetch('/api/taller-personal').then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        fetch('/api/conductores-lista').then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        fetch('/api/conductores').then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; })
    ]).then(function(res) {
        var names = new Set();
        (Array.isArray(res[0]) ? res[0] : []).forEach(function(x){ if (x.nombre) names.add(x.nombre.trim()); });
        (Array.isArray(res[1]) ? res[1] : []).forEach(function(x){ var n = typeof x === 'string' ? x : (x.nombre || x[1] || ''); if (n) names.add(n.trim()); });
        (Array.isArray(res[2]) ? res[2] : (res[2].data || [])).forEach(function(x){ var n = x.nombre_completo || x.nombre || ''; if (n) names.add(n.trim()); });

        var finalArr = Array.from(names).filter(Boolean).sort();
        if (!finalArr.length) {
            finalArr = ['AMADOR MARINO ROJAS ECHEVARRIA', 'TECNICO DE TALLER'];
        }

        window._rotPersonalItems = finalArr.map(function(p) { return { value: p, label: p }; });
        if (typeof callback === 'function') callback();
    }).catch(function() {
        if (typeof callback === 'function') callback();
    });
};

window.rotAbrirEditarOT = function(idOT) {
    if (!idOT) return;

    var executeAbrir = function(ot) {
        if (!ot) {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('No se encontró la Orden de Trabajo', 'warning');
            return;
        }

        var det = {};
        try {
            det = typeof ot.detalles_json === 'string' ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {});
        } catch(e) { det = {}; }

        // Asegurar que el select de situaciones tenga las opciones cargadas
        rotPoblarSelectSituacion();

        var set = function(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
        set('rot-eot-id', idOT);

        var badgeId = document.getElementById('rot-eot-badge-id');
        if (badgeId) badgeId.textContent = idOT;
        var lbl = document.getElementById('rot-eot-id-lbl');
        if (lbl) lbl.textContent = 'Unidad: ' + (ot.placa || '—') + ' • ' + (det.rampa_origen ? 'Rampa ' + det.rampa_origen : 'Sin Rampa');

        var supVal = (det.supervisor || ot.supervisor || '').trim();
        set('rot-eot-supervisor', supVal);

        window.rotAsegurarPersonalItems(function() {
            // Supervisor combobox
            if (typeof window._cbInit === 'function' && window._rotPersonalItems && window._rotPersonalItems.length) {
                window._cbInit('rot-eot-sup', window._rotPersonalItems, 'SELECCIONE SUPERVISOR...');
                if (supVal) window._cbSet('rot-eot-sup', supVal, supVal);
            }
        });

        // Situación
        var sitEl = document.getElementById('rot-eot-situacion');
        if (sitEl) sitEl.value = det.situacion_inicial || ot.situacion || 'En atención';

        // Tipo OT
        var tipoEl = document.getElementById('rot-eot-tipo');
        if (tipoEl) {
            tipoEl.value = det.tipo_ot || ot.tipo || 'Correctivo';
            rotCambiarTipoEOT();
        }
        // Sub tipo
        setTimeout(function() {
            var subEl = document.getElementById('rot-eot-subtipo');
            if (subEl) subEl.value = det.sub_tipo || det.subtipo_ot || (subEl.options[0] ? subEl.options[0].value : '');
        }, 50);

        // Desglosar trabajos existentes
        window._rotEotTrabajos = [];
        window._rotEotTrabajosCount = 0;

        var rawMotivo = rotCleanObsText(det.motivo || ot.observaciones || '');
        var parsed = (typeof window.srParsearTareasArray === 'function') 
            ? window.srParsearTareasArray(rawMotivo) 
            : { tareas: rawMotivo ? rawMotivo.split('\n').map(function(s){ return s.trim(); }).filter(Boolean) : [], notas: [] };

        // Mapear técnicos asignados
        var tecsArray = [];
        if (det.tecnicos && Array.isArray(det.tecnicos)) tecsArray = det.tecnicos;
        else if (det.tecnicos_str) tecsArray = det.tecnicos_str.split(',').map(function(s){ return s.trim(); });

        parsed.tareas.forEach(function(tDesc, tIdx) {
            var cleanDesc = String(tDesc || '').replace(/^(?:\d+[\.\)\-]?\s*)+/, '').trim();
            var tecDeEstaTarea = '';
            if (det.trabajos_det && Array.isArray(det.trabajos_det) && det.trabajos_det[tIdx] && det.trabajos_det[tIdx].tecnico) {
                tecDeEstaTarea = det.trabajos_det[tIdx].tecnico;
            } else {
                tecDeEstaTarea = tecsArray[tIdx] || tecsArray[0] || '';
            }

            window._rotEotTrabajos.push({
                id: 'rot_eot_t_' + (window._rotEotTrabajosCount++),
                desc: cleanDesc,
                tecnico: tecDeEstaTarea
            });
        });

        if (!window._rotEotTrabajos.length) {
            window._rotEotTrabajos.push({
                id: 'rot_eot_t_' + (window._rotEotTrabajosCount++),
                desc: 'MANTENIMIENTO / REVISIÓN GENERAL',
                tecnico: tecsArray[0] || ''
            });
        }

        set('rot-eot-motivo', parsed.notas ? parsed.notas.join('\n') : '');

        window.rotEotRenderTrabajos();
        rotAbrirSubDrawer('rot-drawer-editar-ot');
    };

    // Obtener datos frescos de la OT desde la API
    fetch('/api/ordenes-trabajo')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            window.rotData = Array.isArray(data) ? data : [];
            var ot = window.rotData.find(function(x) { return (x.ticket_entrada || x.id_ot) == idOT; });
            if (!ot && window.srOtData) {
                ot = (window.srOtData || []).find(function(x) { return (x.ticket_entrada || x.id_ot) == idOT; });
            }
            executeAbrir(ot);
        })
        .catch(function() {
            var ot = (window.rotData || []).find(function(x) { return (x.ticket_entrada || x.id_ot) == idOT; });
            executeAbrir(ot);
        });
};

window.rotEotRenderTrabajos = function() {
    var container = document.getElementById('rot-eot-fallas-container');
    if (!container) return;

    var html = '';
    window._rotEotTrabajos.forEach(function(t, idx) {
        var tecInputId = 'rot_eot_tec_' + t.id;
        html += `
            <div class="p-2 rounded-3 border bg-white shadow-2xs d-flex flex-wrap align-items-center justify-content-between gap-2" id="row_${t.id}" style="border: 1px solid #e2e8f0 !important; overflow: visible !important;">
                <div class="d-flex align-items-center gap-2 flex-grow-1" style="min-width: 220px;">
                    <span class="badge bg-primary rounded-pill d-flex align-items-center justify-content-center fw-bold text-white flex-shrink-0" style="width: 22px; height: 22px; font-size: 0.72rem;">
                        ${idx + 1}
                    </span>
                    <input type="text" class="form-control form-control-sm text-uppercase fw-bold border-0 bg-light" 
                           id="desc_${t.id}" 
                           value="${rotEscHtml(t.desc)}" 
                           placeholder="DESCRIPCIÓN DEL TRABAJO..." 
                           style="font-size: 0.8rem; min-height: 38px; border-radius: 8px;" 
                           oninput="window._rotEotTrabajos[${idx}].desc = this.value">
                </div>

                <div class="d-flex align-items-center gap-1" style="min-width: 200px; max-width: 260px; position: relative;">
                    <i class="bi bi-person-gear text-secondary" style="font-size: 0.85rem;"></i>
                    <div class="position-relative flex-grow-1">
                        <input type="text" id="${tecInputId}-txt" 
                               class="form-control form-control-sm bg-white text-uppercase fw-bold" 
                               style="font-size: 0.78rem; min-height: 38px; border-radius: 8px;"
                               placeholder="SELECCIONE TÉCNICO..." 
                               autocomplete="off" 
                               oninput="window._cbFiltrar('${tecInputId}')" 
                               onfocus="window._cbFiltrar('${tecInputId}')" 
                               onblur="window._cbHide('${tecInputId}')">
                        <input type="hidden" id="${tecInputId}">
                        <div id="${tecInputId}-dd" class="cb-dropdown"></div>
                    </div>
                </div>

                ${window._rotEotTrabajos.length > 1 ? `
                    <button type="button" class="btn btn-outline-danger btn-sm border-0 p-1" onclick="window.rotEotQuitarTrabajoFila(${idx})" title="Eliminar fila">
                        <i class="bi bi-trash3-fill"></i>
                    </button>
                ` : ''}
            </div>
        `;
    });

    container.innerHTML = html;

    window.rotAsegurarPersonalItems(function() {
        if (typeof window._cbInit === 'function' && window._rotPersonalItems && window._rotPersonalItems.length) {
            window._rotEotTrabajos.forEach(function(t) {
                var tecInputId = 'rot_eot_tec_' + t.id;
                window._cbInit(tecInputId, window._rotPersonalItems, 'SELECCIONE TÉCNICO...');
                if (t.tecnico) {
                    window._cbSet(tecInputId, t.tecnico, t.tecnico);
                }
            });
        }
    });
};

window.rotEotAgregarTrabajoFila = function() {
    window._rotEotTrabajos.push({
        id: 'rot_eot_t_' + (window._rotEotTrabajosCount++),
        desc: '',
        tecnico: ''
    });
    window.rotEotRenderTrabajos();
};

window.rotEotQuitarTrabajoFila = function(idx) {
    if (window._rotEotTrabajos.length <= 1) return;
    window._rotEotTrabajos.splice(idx, 1);
    window.rotEotRenderTrabajos();
};

window.rotCambiarTipoEOT = function() {
    var tipo = ((document.getElementById('rot-eot-tipo') || {}).value || '');
    var sel  = document.getElementById('rot-eot-subtipo');
    if (!sel) return;
    var opts = ROT_SUBTIPOS[tipo] || [];
    sel.innerHTML = opts.map(function(s) {
        return '<option value="' + s + '">' + s + '</option>';
    }).join('');
    sel.disabled = !opts.length;
    if (opts.length) sel.value = opts[0];
};

window.rotGuardarEdicionOT = function() {
    var idOT       = ((document.getElementById('rot-eot-id')         || {}).value || '').trim();
    var tipo       = ((document.getElementById('rot-eot-tipo')       || {}).value || '').trim();
    var subtipo    = ((document.getElementById('rot-eot-subtipo')    || {}).value || '').trim();
    var supervisor = (typeof window._cbGet === 'function' ? window._cbGet('rot-eot-sup') : '') || ((document.getElementById('rot-eot-sup-txt') || {}).value || '').trim();
    var situacion  = ((document.getElementById('rot-eot-situacion')  || {}).value || '').trim();
    var notasExtra = ((document.getElementById('rot-eot-motivo')     || {}).value || '').trim();

    if (!idOT) return;

    // Recopilar trabajos y técnicos
    var tareasFinales = [];
    var tecnicosFinales = [];
    var trabajosDet = [];

    window._rotEotTrabajos.forEach(function(t) {
        var inputDesc = document.getElementById('desc_' + t.id);
        var rawVal = (inputDesc ? inputDesc.value : t.desc).trim();
        var descClean = rawVal.replace(/^(?:\d+[\.\)\-]?\s*)+/, '').trim();
        var tecInputId = 'rot_eot_tec_' + t.id;
        var tecVal = (typeof window._cbGet === 'function' ? window._cbGet(tecInputId) : '') || ((document.getElementById(tecInputId + '-txt') || {}).value || '').trim();

        if (descClean) {
            tareasFinales.push(descClean);
            trabajosDet.push({ desc: descClean, tecnico: tecVal });
            if (tecVal && !tecnicosFinales.includes(tecVal)) {
                tecnicosFinales.push(tecVal);
            }
        }
    });

    var motivoFinal = tareasFinales.map(function(t, i){ return (i + 1) + '. ' + t; }).join('\n');
    if (notasExtra) {
        motivoFinal += '\nNota: ' + notasExtra;
    }

    fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            accion:             'editar',
            tipo_ot:            tipo,
            sub_tipo:           subtipo,
            supervisor:         supervisor,
            situacion_inicial:  situacion,
            motivo:             motivoFinal,
            tecnicos:           tecnicosFinales,
            trabajos_det:       trabajosDet
        })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        window.rotCerrarSubDrawer('rot-drawer-editar-ot');
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT actualizada correctamente', 'success');
        
        // Recargar datos y refrescar las vistas (Taller / Status Rampa / Reportes OT)
        fetch('/api/ordenes-trabajo')
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(data) {
                window.rotData = Array.isArray(data) ? data : [];
                if (window.srOtData) window.srOtData = window.rotData;

                if (typeof window.rotRenderTabla === 'function' && document.getElementById('moduloReportesOT')) {
                    window.rotRenderTabla(window.rotDatosFiltrados || window.rotData);
                }
                if (typeof window.srCargarOTs === 'function') {
                    window.srCargarOTs();
                }
                if (typeof window.srCargarEntradas === 'function') {
                    window.srCargarEntradas();
                }
                if (typeof window.srCargarVista === 'function') {
                    window.srCargarVista();
                }
                window.rotAbrirDetalle(idOT);
            }).catch(function(){});
    })
    .catch(function(err) {
        console.error('Error editando OT:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar los cambios', 'danger');
    });
};

// — Descargar Plantilla Vacía para Inspección —
window.rotDescargarPlantillaOT = function(idOt, placa) {
    if (typeof window.rotToast === 'function') window.rotToast('Generando plantilla OT...', 'bg-info');
    
    // Buscar en memoria
    var ot = null;
    if (window.rotData) ot = window.rotData.find(function(o) { return String(o.ticket_entrada||o.id_ot) === String(idOt); });
    if (!ot && window.srData) ot = window.srData.find(function(o) { return String(o.ticket_entrada||o.id_ot) === String(idOt); });
    if (!ot && window.srOtData) ot = window.srOtData.find(function(o) { return String(o.ticket_entrada||o.id_ot) === String(idOt); });
    if (!ot && window.srEntradas) ot = window.srEntradas.find(function(o) { return String(o.ticket_entrada||o.id_ot||o.ticket) === String(idOt); });

    if (ot) {
        window.generarPDF_OT(ot, [], [], true);
        return;
    }

    // Buscar por API
    fetch('/api/ordenes-trabajo')
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(data) {
          if (!window.rotData) window.rotData = data;
          var found = data.find(function(o) { return String(o.ticket_entrada||o.id_ot) === String(idOt); });
          if (!found) found = { ticket_entrada: idOt, placa: placa };
          window.generarPDF_OT(found, [], [], true);
      })
      .catch(function(e) {
          console.error(e);
          window.generarPDF_OT({ ticket_entrada: idOt, placa: placa }, [], [], true);
      });
};

window.descargarPlantillaVaciaOT = function(idOt, placa, fechaIng, km, rampa) {
    if (typeof window.rotToast === 'function') window.rotToast('Generando plantilla...', 'bg-info');
    fetch('/api/mantenimiento/inspecciones/config')
        .then(function(r) { return r.json(); })
        .then(function(res) {
            var schema = res.data ? res.data.map(function(d) {
                var parsed = [];
                try { parsed = typeof d.items_json === 'string' ? JSON.parse(d.items_json) : d.items_json; } catch(e){}
                return { tab: d.titulo, items: parsed };
            }) : [];
            
            var dtStr = '____/____/______';
            if (fechaIng) {
                var parts = fechaIng.split('T')[0].split('-');
                if(parts.length === 3) dtStr = parts[2] + '/' + parts[1] + '/' + parts[0];
            }
            var kmStr = km ? Number(km).toLocaleString('es-PE') : '________________';

            var tbody = '';
            var romanos = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV'];
            schema.forEach(function(sec, idxCat) {
                tbody += '<tr class="sec-row"><td colspan="3">' + (romanos[idxCat] || (idxCat+1)) + '. ' + sec.tab.toUpperCase() + '</td></tr>';
                if (sec.items) {
                    var itemsArr = Array.isArray(sec.items) ? sec.items : [];
                    itemsArr.forEach(function(item, idxItem) {
                        var lbl = typeof item === 'string' ? item : item.label;
                        tbody += '<tr>'
                               + '<td>' + (idxItem+1) + '. ' + rotEscHtml(lbl) + '</td>'
                               + '<td class="w-chk"><div class="sq sq-green"></div> &nbsp; <div class="sq sq-red"></div></td>'
                               + '<td></td>'
                               + '</tr>';
                    });
                }
            });

            var empLogoUrl = localStorage.getItem('fleet_empresa_logo') || window._LOGO_BASE64 || 'https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500';
            var html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reporte Fallas Mecánicas</title>
    <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@700&display=swap" rel="stylesheet">
    <style>
        :root {
            --blue-header: #0053b3;
            --blue-num: #4a86e8;
            --chk-green: #00ff00;
            --chk-red: #ff0000;
        }
        * {
            font-family: 'Oswald', sans-serif !important;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        body {
            background-color: #e0e0e0;
            margin: 0;
            padding: 20px;
        }
        #btnPrint {
            position: fixed; top: 20px; right: 20px;
            background-color: #000; color: #fff; border: none;
            padding: 8px 16px; border-radius: 4px;
            font-size: 14px;
            cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.3); z-index: 1000;
        }
        #btnPrint:hover { opacity: 0.9; }
        .page-container {
            width: 210mm;
            height: 296mm;
            background: white;
            padding: 5mm 10mm;
            box-sizing: border-box;
            box-shadow: 0 0 15px rgba(0,0,0,0.2);
            position: relative;
            display: flex;
            flex-direction: column;
            margin: 0 auto;
        }
        .iso-header {
            width: 100%;
            border-collapse: collapse;
            border: 2px solid #000;
            margin-bottom: -2px;
            table-layout: fixed;
            flex-shrink: 0;
        }
        .iso-header td {
            border: 1px solid #000;
            text-align: center;
            vertical-align: middle;
        }
        .logo-cell { 
            width: 20%; 
            padding: 2px;
        }
        .title-cell { 
            width: 55%; 
            font-size: 24px;
            font-weight: bold; 
            line-height: 1; 
            text-transform: uppercase; 
            color: #000;
        }
        .sub-title { 
            font-size: 12px; 
            font-weight: normal; 
            color: #333; 
            letter-spacing: 1px;
        }
        .qms-item { 
            width: 25%; 
            font-size: 10px; 
            text-align: left !important; 
            padding: 1px 4px; 
            height: 16px; 
        }
        .data-grid {
            width: 100%;
            border-collapse: collapse;
            border: 2px solid #000;
            margin-bottom: 4px;
            table-layout: fixed;
            flex-shrink: 0;
        }
        .data-grid td {
            border: 1px solid #000;
            padding: 1px 4px;
            font-size: 11px;
            font-weight: bold;
            height: 20px;
            vertical-align: middle;
        }
        .col-left { width: 35%; }
        .col-mid { width: 35%; }
        .col-right { width: 30%; vertical-align: top !important; padding-top: 2px !important; }
        .val-normal { font-weight: normal; margin-left: 3px; }
        .val-blue { color: var(--blue-num); font-size: 13px; margin-left: 3px; }
        .table-wrapper {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            margin-bottom: 5px;
        }
        .checklist-table {
            width: 100%;
            flex-grow: 1;
            border-collapse: collapse;
            border: 2px solid #000;
            font-size: 9.5px;
        }
        .checklist-table th {
            background-color: var(--blue-header);
            color: white;
            text-transform: uppercase;
            padding: 2px;
            border: 1px solid #000;
            text-align: left;
        }
        .checklist-table th.th-center { text-align: center; }
        .checklist-table td {
            border: 1px solid #000;
            padding: 1px 3px;
            vertical-align: middle;
        }
        .sec-row td {
            background-color: #f2f2f2;
            font-weight: bold;
            border-top: 2px solid #000;
            padding: 1px 3px;
        }
        .w-crit { width: 45%; }
        .w-chk { width: 10%; text-align: center; padding: 0; }
        .w-obs { width: 45%; }
        .sq {
            display: inline-block;
            width: 9px; height: 9px;
            background: #fff; margin-top: 2px;
        }
        .sq-green { border: 2px solid var(--chk-green); }
        .sq-red { border: 2px solid var(--chk-red); }
        .footer {
            flex-shrink: 0;
            height: 45px;
            display: flex;
            justify-content: center;
            align-items: flex-end;
            padding: 0 10px;
        }
        .sign-box {
            width: 30%;
            text-align: center;
        }
        .sign-line {
            border-top: 2px solid #000;
            margin-bottom: 2px;
        }
        .sign-label {
            font-weight: bold;
            font-size: 11px;
        }
        @media print {
            @page { size: A4; margin: 0; }
            body { background: none; padding: 0; margin: 0; }
            #btnPrint { display: none; }
            .page-container { 
                width: 210mm; 
                height: 296mm; 
                padding: 5mm 10mm;
                box-shadow: none; 
                border: none; 
                margin: 0;
            }
        }
    </style>
</head>
<body>
    <button id="btnPrint" onclick="window.print()">Print PDF</button>
    <div class="page-container">
        <table class="iso-header">
            <tr>
                <td class="logo-cell" rowspan="3">
                    <img src="${empLogoUrl}" alt="Logo Empresa" style="max-width: 100%; max-height: 45px; object-fit: contain;">
                </td>
                <td class="title-cell" rowspan="3">
                    INSPECCIÓN DE PRE USO DE UNIDAD<br>
                    <span class="sub-title">REPORTE DE FALLAS MECÁNICAS</span>
                </td>
                <td class="qms-item"><b>CÓDIGO:</b> F-MAN-003</td>
            </tr>
            <tr><td class="qms-item"><b>VERSIÓN:</b> 0</td></tr>
            <tr><td class="qms-item"><b>F. EMISIÓN:</b> 10/11/2025</td></tr>
        </table>
        <table class="data-grid">
            <tr>
                <td class="col-left">Nº de Reporte: <span class="val-blue">${rotEscHtml(idOt)}</span></td>
                <td class="col-mid">Placa: <span class="val-normal">${rotEscHtml(placa)}</span></td>
                <td class="col-right" rowspan="2">
                    Rampa:<br>
                    <span class="val-normal" style="display: block; margin-top: 1px; word-wrap: break-word;">${rotEscHtml(rampa || '')}</span>
                </td>
            </tr>
            <tr>
                <td>Fecha de Ingreso: <span class="val-normal">${rotEscHtml(dtStr)}</span></td>
                <td>Kilometraje: <span class="val-normal">${rotEscHtml(kmStr)}</span></td>
            </tr>
        </table>
        <div class="table-wrapper">
            <table class="checklist-table">
                <thead>
                    <tr>
                        <th class="w-crit">CRITERIOS</th>
                        <th class="w-chk th-center">ESTADO</th>
                        <th class="w-obs th-center">OBSERVACION</th>
                    </tr>
                </thead>
                <tbody>${tbody}</tbody>
            </table>
        </div>
        <div class="footer">
            <div class="sign-box">
                <div class="sign-line"></div>
                <div class="sign-label">Tecnico</div>
            </div>
            <div class="sign-box">
                <div class="sign-line"></div>
                <div class="sign-label">Jefe de taller</div>
            </div>
            <div class="sign-box">
                <div class="sign-line"></div>
                <div class="sign-label">Planner de Mantenimiento</div>
            </div>
        </div>
    </div>
</body>
</html>`;

            var win = window.open('', '_blank');
            win.document.open();
            win.document.write(html);
            win.document.close();
            win.onload = function() {
                setTimeout(function() {
                    win.print();
                }, 500);
            };
        }).catch(function(e) {
            console.error('Error fetching schema for pdf', e);
            if (typeof window.rotToast === 'function') window.rotToast('Error al generar plantilla', 'bg-danger');
        });
};


// Inject Tailwind for mobile view dynamically
(function() {
    if (!document.getElementById('tailwind-cdn-injected')) {
        window.tailwind = window.tailwind || {};
        tailwind.config = {
            corePlugins: { preflight: false },
            theme: {
                extend: {
                    colors: {
                        brand: { 50: '#f0f4ff', 100: '#d9e2ff', 500: '#1d4ed8', 600: '#1e40af', 900: '#1e3a8a' },
                        status: { pending: '#f59e0b', process: '#3b82f6', paused: '#ea580c', closed: '#ef4444', done: '#10b981' }
                    },
                    fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'] }
                }
            }
        };
        const s = document.createElement('script');
        s.id = 'tailwind-cdn-injected';
        s.src = "https://cdn.tailwindcss.com";
        document.head.appendChild(s);
    }
})();

window.rotVerFormatoOT = function(idOT) {
    if (typeof window.rotToast === 'function') window.rotToast('Cargando detalle de OT...', 'bg-info');

    Promise.all([
        fetch('/api/ot-trabajos?id_ot=' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; })
    ]).then(function(res) {
        var trabajos   = Array.isArray(res[0]) ? res[0] : [];
        var materiales = Array.isArray(res[1]) ? res[1] : [];
        var ot = window.rotData.find(function(o) {
            return String(o.ticket_entrada || o.id_ot || '') === String(idOT);
        });
        if (!ot) { alert('OT no encontrada.'); return; }

        window.currentVerTrabajos   = trabajos;
        window.currentVerMateriales = materiales;

        // Crear el modal si no existe
        if (!document.getElementById('modalFormatoOT')) {
            var m = document.createElement('div');
            m.innerHTML =
                '<div class="modal fade" id="modalFormatoOT" tabindex="-1" aria-hidden="true">'
              + '  <div class="modal-dialog modal-xl modal-dialog-scrollable">'
              + '    <div class="modal-content" style="height:90vh;">'
              + '      <div class="modal-header py-2" style="background:#f8fafc;">'
              + '        <h5 class="modal-title fw-bold" id="tituloModalFormatoOT" style="font-size:15px;color:#1e293b;"><i class="bi bi-file-earmark-text text-primary"></i> Detalle de OT</h5>'
              + '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>'
              + '      </div>'
              + '      <div class="modal-body p-0" style="background:#e0e0e0;display:flex;justify-content:center;">'
              + '        <iframe id="iframeFormatoOT" style="width:100%;height:100%;border:none;"></iframe>'
              + '      </div>'
              + '      <div class="modal-footer py-2" style="background:#f8fafc;">'
              + '        <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Cerrar</button>'
              + '        <button type="button" class="btn btn-sm btn-primary" id="btnImprimirModalOT"><i class="bi bi-printer me-1"></i>Imprimir</button>'
              + '      </div>'
              + '    </div>'
              + '  </div>'
              + '</div>';
            document.body.appendChild(m.firstChild);
        }

        // Actualizar titulo
        var titleEl = document.getElementById('tituloModalFormatoOT');
        if (titleEl) titleEl.innerHTML = '<i class="bi bi-file-earmark-text text-primary"></i> Detalle de OT ' + rotEscHtml(idOT);

        // Configurar boton Imprimir para esta OT especifica
        var btnImprimir = document.getElementById('btnImprimirModalOT');
        if (btnImprimir) {
            btnImprimir.onclick = function() {
                window.generarPDF_OT(
                    window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot) === String(idOT); }),
                    window.currentVerTrabajos,
                    window.currentVerMateriales
                );
            };
        }

        // Mostrar modal
        var modalEl = document.getElementById('modalFormatoOT');
        var myModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        myModal.show();

        // Placeholder de carga en el iframe
        var iframe = document.getElementById('iframeFormatoOT');
        if (iframe) iframe.srcdoc = '<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#94a3b8;"><span>Cargando previsualizacion...</span></body></html>';

        // Generar HTML via callback, sin abrir ventana emergente
        window.generarPDF_OT(ot, trabajos, materiales, false, function(htmlStr) {
            // Quitar el boton de imprimir interno; el modal tiene el suyo
            htmlStr = htmlStr.replace(/<button[^>]*id="btnPrint"[^>]*>[\s\S]*?<\/button>/i, '');
            var iframe2 = document.getElementById('iframeFormatoOT');
            if (iframe2) iframe2.srcdoc = htmlStr;
        });
    });
};



window.rotAbrirEditarFechas = async function(idOT) {
    if (!window.guardAction('ot', 'e')) return;
    var ot = await window.rotObtenerOTAsync(idOT);
    if (!ot) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('No se encontró la información de la OT ' + idOT, 'warning');
        return;
    }
    
    window.rotEditFechasId = idOT;
    
    var fIniStr = ot.fecha_inicio_ot || ot.fecha_ingreso || '';
    var fFinStr = ot.fecha_hora_salida || '';
    
    var formatForInput = function(isoStr) {
        if (!isoStr) return '';
        try {
            var s = typeof isoStr === 'string' ? isoStr.replace('Z', '') : isoStr;
            var d = new Date(s);
            if (isNaN(d.getTime())) return '';
            var pad = function(n) { return String(n).padStart(2, '0'); };
            return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } catch(e) { return ''; }
    };

    document.getElementById('rot-ef-inicio').value = formatForInput(fIniStr);
    document.getElementById('rot-ef-termino').value = formatForInput(fFinStr);
    
    window.rotAbrirSubDrawer('rot-drawer-editar-fechas');
};

window.rotGuardarFechas = function() {
    var idOT = window.rotEditFechasId;
    if (!idOT) return;
    
    var ini = document.getElementById('rot-ef-inicio').value;
    var fin = document.getElementById('rot-ef-termino').value;
    
    if (ini && fin && new Date(ini) > new Date(fin)) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La fecha de inicio no puede ser mayor al término.', 'warning');
        return;
    }

    var iniStr = ini ? (ini.length === 16 ? ini + ':00' : ini).replace('T', ' ') : null;
    var finStr = fin ? (fin.length === 16 ? fin + ':00' : fin).replace('T', ' ') : null;
    
    fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT) + '/fechas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha_inicio_ot: iniStr, fecha_hora_salida: finStr })
    })
    .then(function(r) { if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(r) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Fechas actualizadas correctamente.', 'success');
        window.rotCerrarSubDrawer('rot-drawer-editar-fechas');
        window.rotCerrarDetalle();
        if (typeof window.rotCargar === 'function' && document.getElementById('moduloReportesOT')) {
            window.rotCargar();
        }
        if (typeof window.srCargarOTs === 'function') {
            window.srCargarOTs();
        }
        if (typeof window.srCargarEntradas === 'function') {
            window.srCargarEntradas();
        }
    })
    .catch(function(e) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al actualizar las fechas.', 'danger');
    });
};



