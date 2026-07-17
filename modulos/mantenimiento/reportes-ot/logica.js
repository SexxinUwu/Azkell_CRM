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

// ── Entry point ──────────────────────────────────────────────────
window.init_reportes_ot = function() {
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
    window._rotFiltroEstado = estado;
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
    var filEst  = window._rotFiltroEstado || '';

    var resultado = window.rotData.filter(function(ot) {
        var det = rotDetalles(ot);
        var fechaOT = rotFechaISO(ot.creado_en);

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
        // Filtro mes
        if (filMes && fechaOT.slice(0, 7) !== filMes) return false;
        // Filtro desde
        if (filDesde && fechaOT < filDesde) return false;
        // Filtro hasta
        if (filHasta && fechaOT > filHasta) return false;
        // Filtro estado (aprobación)
        if (filEst && ot.aprobacion !== filEst) return false;

        return true;
    });

    window.rotDatosFiltrados = resultado;
    rotActualizarKPIs(resultado);
    window.rotRenderTabla(resultado);
};

// ── Permiso edición OT (lectura directa, sin depender de checkPerm global) ───
function rotPuedeEditar() {
    try {
        var p = JSON.parse(localStorage.getItem('fleet_permisos') || '{}');
        if (p.admin === true) return true;
        return !!(p.ot && (p.ot.e === 1 || p.ot.e === true));
    } catch(e) { return false; }
}

// ── Botones de acción modernos por estado ─────────────────────────
function rotBotonesAccion(ot) {
    var idOT   = rotEscHtml(String(ot.ticket_entrada || ot.id_ot || ''));
    var estado = ot.estado || 'Pendiente';
    if (!rotPuedeEditar()) return '';

    var b = function(cls, icon, txt, accion) {
        return '<button class="rot-btn ' + cls + '" onclick="event.stopPropagation();window.rotAccion(\'' + accion + '\',\'' + idOT + '\')">'
             + '<i class="bi ' + icon + '"></i>' + txt + '</button>';
    };

    if (estado === 'Pendiente' || (!['En Proceso','Pausada','Finalizado','Cerrada','Anulado'].includes(estado))) {
        return b('rot-btn-iniciar', 'bi-play-fill', 'Iniciar', 'iniciar');
    }
    if (estado === 'En Proceso') {
        return b('rot-btn-pausar',  'bi-pause-fill', 'Pausar', 'pausar')
             + ' '
             + b('rot-btn-cerrar',  'bi-lock-fill',  'Cerrar', 'cerrar');
    }
    if (estado === 'Pausada') {
        return b('rot-btn-reanudar', 'bi-play-fill', 'Reanudar', 'reanudar')
             + ' '
             + b('rot-btn-cerrar',   'bi-lock-fill', 'Cerrar',   'cerrar');
    }
    if (estado === 'Finalizado' || estado === 'Cerrada') {
        return '<span class="rot-badge rot-b-finalizado">Finalizado</span>';
    }
    if (estado === 'Anulado') {
        return '<span class="rot-badge rot-b-anulado">Anulado</span>';
    }
    return '';
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

// ── Render tabla ─────────────────────────────────────────────────
window.rotRenderTabla = function(lista) {
    var tbody = document.getElementById('rot-tbody');
    var mobileList = document.getElementById('otListMobile');
    
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="td-empty">No hay resultados con los filtros aplicados.</td></tr>';
        if(mobileList) mobileList.innerHTML = '<div style="text-align:center; padding: 40px 20px; color: #94a3b8; font-size: 13px;"><i class="bi bi-inbox" style="font-size: 32px; display: block; margin-bottom: 12px; color: #cbd5e1;"></i> No se encontraron OTs</div>';
        return;
    }

    var html = '';
    var mobileHtml = '';
    
    for (var i = 0; i < lista.length; i++) {
        var ot  = lista[i];
        var det = rotDetalles(ot);
        var esActiva = (window.rotDetalleId !== null && String(window.rotDetalleId) === String(ot.ticket_entrada || ot.id_ot));
        var idOT = ot.ticket_entrada || ot.id_ot || '?';
        var obs  = rotEscHtml((det.motivo || ot.observaciones || '').substring(0, 80)) + ((det.motivo || ot.observaciones || '').length > 80 ? '...' : '');

        // --- DESKTOP ROW ---
        html += '<tr class="' + (esActiva ? 'rot-row-activa' : '') + '" onclick="window.rotAbrirDetalle(\'' + rotEscHtml(String(idOT)) + '\')">';
        html += '<td onclick="event.stopPropagation();" style="white-space:nowrap;padding:8px 10px;">' + rotBotonesAccion(ot) + '</td>';
        html += '<td style="font-weight:800;color:var(--primary,#5865F2);white-space:nowrap;">' + rotEscHtml(String(idOT)) + '</td>';
        html += '<td style="font-weight:700;">' + rotEscHtml(ot.placa || '?') + '</td>';
        html += '<td style="font-size:0.85rem;color:var(--text);">' + rotEscHtml(det.km ? Number(det.km).toLocaleString('es-PE') + ' km' : '?') + '</td>';
        html += '<td>' + rotBadgeTipo(det.tipo_ot || ot.tipo || '') + (det.sub_tipo ? '<span style="color:var(--subtext);font-size:0.78rem;margin-left:5px;">' + rotEscHtml(det.sub_tipo) + '</span>' : '') + '</td>';
        html += '<td style="font-size:0.8rem;">' + rotEscHtml(det.supervisor || ot.supervisor || '?') + '</td>';
        html += '<td>' + rotBadgeSituacion(det.situacion_inicial || ot.situacion) + '</td>';
        html += '<td style="font-size:0.78rem;color:var(--subtext);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + rotEscHtml(det.motivo || ot.observaciones || '') + '">' + (obs || '?') + '</td>';
        html += '<td style="font-weight:700;color:#16a34a;">' + rotFmtMoney(ot.costo_total) + '</td>';
        html += '<td style="font-size:0.78rem;color:var(--subtext);white-space:nowrap;">' + rotFmtFecha(ot.fecha_ingreso || ot.creado_en) + '</td>';
        html += '<td style="text-align:center;"><button class="btn btn-sm" style="background:#f1f5f9;border:1px solid #e2e8f0;color:#3b82f6;border-radius:6px;padding:3px 8px;" onclick="event.stopPropagation(); window.rotVerFormatoOT(\'' + rotEscHtml(String(idOT)) + '\')"><i class="bi bi-eye-fill"></i></button></td>';
        html += '</tr>';
    }
    
    tbody.innerHTML = html;
}

window.rotAbrirDetalle = function(idOT) {
    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
    if (!ot) return;

    window.rotDetalleId  = idOT;
    window.rotOtActivaId = idOT;
    window.rotRenderTabla(window.rotDatosFiltrados);

    var det    = rotDetalles(ot);
    var estado = ot.estado || 'Pendiente';
    var esAprobada = (estado === 'Aprobada' || estado === 'En Proceso' || estado === 'Pausada' || estado === 'Finalizado' || estado === 'Cerrada');
    var puedeAgregarMaterial = esAprobada;
    var puedeEditar = window.checkPerm('ot', 'e');

    function esc(s) { return rotEscHtml(String(s||'')); }
    function fld(lbl, val) {
        return '<div class="rot-field"><span class="rot-field-lbl">' + esc(lbl) + '</span><span class="rot-field-val">' + val + '</span></div>';
    }
    function badge(e) {
        var map = {
            'Pendiente':  ['rot-b-pendiente',  'Pendiente'],
            'En Proceso': ['rot-b-en-proceso', 'En Proceso'],
            'Pausada':    ['rot-b-pausada',    'Pausada'],
            'Aprobada':   ['rot-b-aprobada',   'Aprobada'],
            'Cerrada':    ['rot-b-finalizado', 'Cerrada'],
            'Finalizado': ['rot-b-finalizado', 'Finalizado'],
            'Anulado':    ['rot-b-anulado',    'Anulado']
        };
        var v = map[e] || ['rot-b-pendiente', e || '—'];
        return '<span class="rot-badge ' + v[0] + '">' + v[1] + '</span>';
    }

    var html = '';
    // ID bar
    html += '<div class="rot-id-bar">';
    html += '<div><div class="rot-id-lbl">N° Orden de Trabajo</div><div class="rot-id-num">' + esc(idOT) + '</div></div>';
    html += '<div style="text-align:right;">' + badge(estado)
          + '<div style="font-size:0.72rem;color:var(--subtext);margin-top:4px;">' + rotFmtFecha(ot.fecha_ingreso || ot.creado_en) + '</div></div>';
    html += '</div>';

    // Datos Generales
    html += '<div class="rot-sec"><div class="rot-sec-hd">Datos Generales</div>';
    html += fld('Placa',      esc(ot.placa || '-'));
    var rId = det.rampa_origen || '';
    var rObj = (window._rotCatRampas || []).find(function(x) { return x.id == rId; });
    var rName = rObj ? (rObj.descripcion || rObj.nombre || rId) : rId;
    html += fld('Rampa',      esc(rName || '-'));
    html += fld('Tipo OT',    esc(det.tipo_ot   || ot.tipo      || '-'));
    html += fld('Sub Tipo',   esc(det.sub_tipo   || '—'));
    html += fld('Supervisor', esc(det.supervisor || ot.supervisor|| '—'));
    html += fld('Status Rampa',  esc(det.situacion_inicial || ot.situacion || '—'));
    html += fld('Costo Total','<span id="rot-ot-costo-total" style="font-weight:800;color:#16a34a;">S/' + parseFloat(ot.costo_total||0).toFixed(2) + '</span>');
    html += '</div>';

    // Tiempos de la OT
    var t = rotCalcularTiempos(ot);
    html += '<div class="rot-sec"><div class="rot-sec-hd">Tiempos de la Orden</div>';
    html += fld('Ingreso a Taller', rotFmtFecha(ot.fecha_ingreso || ot.creado_en));
    if (det.km !== undefined) {
        var kmHtml = '<div style="display:flex;align-items:center;gap:10px;">'
                   + '<span id="rot-ot-km-txt">' + Number(det.km).toLocaleString('es-PE') + ' km</span>'
                   + (puedeEditar ? '<button class="btn btn-sm rot-btn-agregar" onclick="window.rotEditarKm(\'' + esc(idOT) + '\', ' + det.km + ')" style="padding:1px 6px;font-size:0.7rem;background:rgba(14,165,233,0.1);color:#0ea5e9;border-radius:12px;"><i class="bi bi-pencil"></i></button>' : '')
                   + '</div>';
        html += fld('Kilometraje', kmHtml);
    } else if (puedeEditar) {
        html += fld('Kilometraje', '<button class="btn btn-sm rot-btn-agregar" onclick="window.rotEditarKm(\'' + esc(idOT) + '\', 0)" style="padding:1px 6px;font-size:0.7rem;background:rgba(14,165,233,0.1);color:#0ea5e9;border-radius:12px;"><i class="bi bi-plus"></i> Agregar KM</button>');
    }
    html += fld('Estado OT', rotBadgeEstado(ot.estado));
    if (t.inicio) {
        html += fld('Inicio OT', rotFmtFechaHora(t.inicio) + (ot.iniciado_por ? '<span style="color:var(--subtext);font-size:0.75rem;margin-left:6px;">por ' + esc(rotGetNombreUsuario(ot.iniciado_por)) + '</span>' : ''));
    }
    if (t.fin) {
        html += fld('Cierre OT', rotFmtFechaHora(t.fin) + (ot.cerrado_por ? '<span style="color:var(--subtext);font-size:0.75rem;margin-left:6px;">por ' + esc(rotGetNombreUsuario(ot.cerrado_por)) + '</span>' : ''));
    }
    if (t.inicio) {
        html += '<div style="display:flex;gap:8px;padding:8px 12px 10px;flex-wrap:wrap;">'
              + '<span style="background:rgba(14,165,233,0.12);color:#0ea5e9;border-radius:8px;padding:5px 12px;font-size:0.75rem;font-weight:700;"><i class="bi bi-play-fill me-1"></i>Trabajado: ' + rotFmtDuracion(t.tiempoTrabajadoMs) + '</span>'
              + '<span style="background:rgba(239,68,68,0.1);color:#ef4444;border-radius:8px;padding:5px 12px;font-size:0.75rem;font-weight:700;"><i class="bi bi-pause-fill me-1"></i>T. Muerto: ' + rotFmtDuracion(t.tiempoMuertoMs) + '</span>'
              + '</div>';
    }
    if (t.pausas.length > 0) {
        html += '<div style="padding:4px 12px 12px;">'
              + '<div style="font-size:0.68rem;font-weight:800;color:var(--subtext);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Detalle de pausas</div>';
        t.pausas.forEach(function(p, idx) {
            var dur = p.fin ? rotFmtDuracion(p.fin - p.inicio) : 'En curso';
            html += '<div style="border-left:3px solid #f59e0b;padding:5px 10px;margin-bottom:6px;background:rgba(245,158,11,0.05);border-radius:0 8px 8px 0;">'
                  + '<div style="font-size:0.74rem;font-weight:700;color:#f59e0b;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
                  + '<span>' + rotFmtFechaHora(p.inicio) + '</span>'
                  + '<span style="opacity:0.6;">→</span>'
                  + '<span>' + (p.fin ? rotFmtFechaHora(p.fin) : '<em>Sin reanudar</em>') + '</span>'
                  + '<span style="background:rgba(245,158,11,0.2);border-radius:6px;padding:1px 7px;">' + dur + '</span>'
                  + '</div>'
                  + (p.motivo ? '<div style="font-size:0.73rem;color:var(--subtext);margin-top:3px;"><i class="bi bi-chat-left-text me-1"></i>' + esc(p.motivo) + '</div>' : '')
                  + '</div>';
        });
        html += '</div>';
    }
    if (ot.comentario_cierre) {
        html += fld('Comentario Cierre', '<span style="font-style:italic;color:var(--subtext);">' + esc(ot.comentario_cierre) + '</span>');
    }
    html += '</div>';

    // Motivo
    if (det.motivo || ot.observaciones) {
        html += '<div class="rot-sec"><div class="rot-sec-hd">Motivo / Observaciones</div>';
        html += '<div style="padding:10px 12px;font-size:0.82rem;color:var(--text);">' + esc(det.motivo || ot.observaciones || '') + '</div>';
        html += '</div>';
    }

    // Acciones Rápidas (Plantillas)
    html += '<div class="rot-sec" style="display:flex; gap:15px; padding:15px; align-items:center;">';
    html += '<button class="btn btn-sm" style="display:flex;flex-direction:column;align-items:center;background:none;border:none;color:var(--text);" onclick="event.stopPropagation();window.descargarPlantillaVaciaOT(\'' + rotEscHtml(idOT) + '\', \'' + rotEscHtml(ot.placa) + '\', \'' + rotEscHtml(ot.fecha_inicio_ot || ot.fecha_ingreso || ot.creado_en || '') + '\', \'' + (det.km||'') + '\', \'' + rotEscHtml(det.rampa_origen||'') + '\')">'
          + '<div style="background:#16a34a;color:white;border-radius:50%;width:42px;height:42px;display:flex;align-items:center;justify-content:center;margin-bottom:6px;"><i class="bi bi-card-checklist" style="font-size:1.2rem;"></i></div>'
          + '<span style="font-size:0.7rem;font-weight:600;line-height:1;">Plantilla<br>Inspecciones</span></button>'
          + "<button class=\"btn btn-sm\" style=\"display:flex;flex-direction:column;align-items:center;background:none;border:none;color:var(--text);\" onclick=\"event.stopPropagation(); window.rotDescargarPlantillaOT('" + rotEscHtml(idOT) + "', '" + rotEscHtml(ot.placa) + "');\">"
          + '<div style="width:40px;height:40px;border-radius:50%;background:#3b82f6;color:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:6px;font-size:1.1rem;"><i class="bi bi-file-earmark-text"></i></div>'
          + '<span style="font-size:0.7rem;font-weight:600;line-height:1;">Plantilla<br>OT</span>'
          + '</button>';
    html += '</div>';

    // Trabajos (placeholder)
    html += '<div class="rot-sec" id="rot-sec-trabajos">'
          + '<div class="rot-sec-hd" style="display:flex;align-items:center;justify-content:space-between;color:var(--primary,#5865F2);">Trabajos <span id="rot-tr-count" style="background:rgba(88,101,242,0.12);color:var(--primary,#5865F2);border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:4px;">…</span>'
          + (esAprobada ? '<button class="btn btn-sm rot-btn-agregar" style="padding:1px 8px;font-size:0.7rem;background:rgba(88,101,242,0.1);color:#5865F2;font-weight:700;border-radius:12px;margin-left:auto;" onclick="event.stopPropagation();window.rotAgregarTrabajo(\'' + rotEscHtml(idOT) + '\')"><i class="bi bi-plus"></i> Agregar</button>' : '') + '</div>'
          + '<div id="rot-tr-body"><div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>'
          + '</div>';

    
      // Salidas de Almacén (placeholder)
      html += '<div class="rot-sec" id="rot-sec-materiales">'
            + '<div class="rot-sec-hd" style="display:flex;align-items:center;justify-content:space-between;color:var(--primary,#5865F2);">Salidas de Almacén <span id="rot-mat-count" style="background:rgba(88,101,242,0.12);color:var(--primary,#5865F2);border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:4px;">…</span>'
            + (esAprobada ? '<button class="btn btn-sm rot-btn-agregar" style="padding:1px 8px;font-size:0.7rem;background:rgba(88,101,242,0.1);color:#5865F2;font-weight:700;border-radius:12px;margin-left:auto;" onclick="event.stopPropagation();window.rotAgregarSalida(\'' + rotEscHtml(idOT) + '\')"><i class="bi bi-plus"></i> Agregar</button>' : '') + '</div>'
            + '<div id="rot-mat-body"><div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>'
            + '</div>';

      // Órdenes de Servicio de Terceros
      html += '<div class="rot-sec" id="rot-sec-servicios">'
            + '<div class="rot-sec-hd" style="display:flex;align-items:center;justify-content:space-between;color:#0ea5e9;">Servicios de Terceros <span id="rot-srv-count" style="background:rgba(14,165,233,0.12);color:#0ea5e9;border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:4px;">…</span>'
            + '</div>'
            + '<div id="rot-srv-body"><div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>'
            + '</div>';


    // Inspección General (placeholder)
    var puedeCrearInsp = puedeEditar || (window.checkPerm && window.checkPerm('insp', 'c'));
    html += '<div class="rot-sec" id="rot-sec-inspecciones">'
          + '<div class="rot-sec-hd" style="display:flex;align-items:center;justify-content:space-between;color:#7c3aed;">Inspección General '
          + (puedeCrearInsp ? '<button class="btn btn-sm rot-btn-agregar" style="padding:1px 8px;font-size:0.7rem;background:rgba(124,58,237,0.1);color:#7c3aed;font-weight:700;border-radius:12px;margin-left:auto;" onclick="event.stopPropagation();window.rotAbrirInspeccionWrapper(\'' + esc(ot.placa) + '\', \'' + esc(idOT) + '\', ' + (det.km||0) + ')"><i class="bi bi-plus"></i> Agregar</button>' : '') + '</div>'
          + '<div id="rot-insp-body"><div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>'
          + '</div>';

    // Backlog pendiente de la unidad (placeholder)
    if (ot.placa) {
        html += '<div class="rot-sec" id="rot-sec-backlog">'
              + '<div class="rot-sec-hd" style="display:flex;align-items:center;justify-content:space-between;color:#d97706;">Mantenimientos Pendientes <span id="rot-bkg-count" style="background:rgba(217,119,6,0.12);color:#d97706;border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:4px;">…</span>'
              + (esAprobada ? '<button class="btn btn-sm rot-btn-agregar" style="padding:1px 8px;font-size:0.7rem;background:rgba(217,119,6,0.1);color:#d97706;font-weight:700;border-radius:12px;margin-left:auto;" onclick="event.stopPropagation();window.rotAbrirAgregarBacklog(\'' + rotEscHtml(ot.placa) + '\')"><i class="bi bi-plus"></i> Agregar</button>' : '') + '</div>'
              + '<div id="rot-bkg-body"><div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>'
              + '</div>';
    }

    var body   = document.getElementById('rot-drawer-body');
    var footer = document.getElementById('rot-drawer-footer');
    var back   = document.getElementById('rotDrawerBackdrop');
    var drawer = document.getElementById('rot-drawer-detalle');
    if (!body || !footer || !drawer) return;

    body.innerHTML = html;

    // Footer
    var puedeEliminar = window.checkPerm('ot', 'd');
    var ftHtml = (puedeEditar
        ? '<button class="btn btn-sm btn-outline-secondary" onclick="window.rotAccion(\'editar\',\'' + esc(idOT) + '\')">'
        + '<i class="bi bi-pencil me-1"></i>Editar OT</button>'
        : '')
        + (puedeEliminar
        ? '<button class="btn btn-sm btn-outline-danger" onclick="window.rotAccion(\'eliminar\',\'' + esc(idOT) + '\')">'
        + '<i class="bi bi-trash me-1"></i>Eliminar</button>'
        : '');

    ftHtml += '<div class="ms-auto d-flex gap-2">';
    if (puedeEditar) {
        if (estado === 'Pendiente') {
            ftHtml += '<button class="btn btn-sm btn-outline-danger" onclick="window.rotAccion(\'anular\',\'' + esc(idOT) + '\')">'
                    + '<i class="bi bi-x-circle me-1"></i>Anular</button>'
                    + '<button class="btn btn-sm btn-info text-white" onclick="window.rotAccion(\'iniciar\',\'' + esc(idOT) + '\')">'
                    + '<i class="bi bi-play-fill me-1"></i>Iniciar</button>';
        } else if (estado === 'En Proceso') {
            ftHtml += '<button class="btn btn-sm btn-warning" onclick="window.rotAccion(\'pausar\',\'' + esc(idOT) + '\')">'
                    + '<i class="bi bi-pause-fill me-1"></i>Pausar</button>'
                    + '<button class="btn btn-sm btn-danger text-white" onclick="window.rotAccion(\'cerrar\',\'' + esc(idOT) + '\')">'
                    + '<i class="bi bi-lock-fill me-1"></i>Cerrar</button>';
        } else if (estado === 'Pausada') {
            ftHtml += '<button class="btn btn-sm btn-success" onclick="window.rotAccion(\'reanudar\',\'' + esc(idOT) + '\')">'
                    + '<i class="bi bi-play-fill me-1"></i>Reanudar</button>'
                    + '<button class="btn btn-sm btn-danger text-white" onclick="window.rotAccion(\'cerrar\',\'' + esc(idOT) + '\')">'
                    + '<i class="bi bi-lock-fill me-1"></i>Cerrar</button>';
        } else if (estado === 'Aprobada') {
            ftHtml += '<button class="btn btn-sm btn-primary" onclick="window.rotAccion(\'cerrar\',\'' + esc(idOT) + '\')">'
                    + '<i class="bi bi-lock-fill me-1"></i>Cerrar OT</button>';
        } else if (estado === 'Finalizado' || estado === 'Cerrada') {
            ftHtml += '<button class="btn btn-sm btn-outline-success" onclick="window.rotAccion(\'reactivar\',\'' + esc(idOT) + '\')">'
                    + '<i class="bi bi-arrow-counterclockwise me-1"></i>Reactivar OT</button>';
        }
    }
    if (puedeEditar) {
        ftHtml += '<button class="btn btn-sm btn-outline-info" onclick="window.rotAbrirEditarFechas(\'' + esc(idOT) + '\')">'
                + '<i class="bi bi-calendar3 me-1"></i>Editar Fechas</button>';
    }
    ftHtml += '<button class="btn btn-sm btn-outline-secondary" onclick="window.rotAccion(\'pdf\',\'' + esc(idOT) + '\')">'
            + '<i class="bi bi-filetype-pdf me-1"></i>PDF</button>';
    ftHtml += '</div>';
    footer.innerHTML = ftHtml;
    footer.style.display = 'flex';

    if (back) back.classList.add('open');
    drawer.classList.add('open');

    // Fetch trabajos + materiales + backlog + inspecciones en paralelo
    window.rotOtTrabajosActivos   = [];
    window.rotOtMaterialesActivos = [];
    window.rotOtInspeccionesActivas = [];
    Promise.all([
        fetch('/api/ot-trabajos?id_ot='       + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        ot.placa ? fetch('/api/ot-backlog?placa=' + encodeURIComponent(ot.placa) + '&estado=Pendiente').then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }) : Promise.resolve([]),
        fetch('/api/inspecciones-por-ot?id_ot=' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        fetch('/api/almacen/entradas?ot_id=' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; })
    ]).then(function(res) {
        window.rotOtTrabajosActivos   = Array.isArray(res[0]) ? res[0] : [];
        window.rotOtMaterialesActivos = Array.isArray(res[1]) ? res[1] : [];
        var backlogItems              = Array.isArray(res[2]) ? res[2] : [];
        window.rotOtInspeccionesActivas = Array.isArray(res[3]) ? res[3] : [];
          var servicios = Array.isArray(res[4]) ? res[4] : [];
          servicios = servicios.filter(function(s) { return (s.tipo_orden||'').toLowerCase() === 'orden de servicio'; });
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
        rotRenderSecBacklog(backlogItems);
        rotRenderSecInspecciones(idOT);
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

// ── Cerrar drawer ─────────────────────────────────────────────────
window.rotCerrarDetalle = function() {
    ['rot-drawer-trabajo', 'rot-drawer-material'].forEach(function(id) {
        var d = document.getElementById(id); if (d) d.classList.remove('open');
    });
    var back   = document.getElementById('rotDrawerBackdrop');
    var drawer = document.getElementById('rot-drawer-detalle');
    if (back)   back.classList.remove('open');
    if (drawer) drawer.classList.remove('open');
    window.rotDetalleId = null;
    window.rotRenderTabla(window.rotDatosFiltrados);
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
window.rotAccion = function(accion, idOT) {
    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
    if (!ot && accion !== 'pdf') return;

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
                window.rotCargar();
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
                    window.rotCargar();
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
                window.rotCargar();
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
                window.rotCargar();
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
            window.rotCargar();
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
                window.rotCargar();
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
                window.rotCargar();
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
window.generarPDF_OT = function(ot, trabajos, materiales, isPlantilla) {
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
    if (det.motivo) {
        htmlMotivos = '<tr><td class="text-center">1</td><td>' + rotEscHtml(det.motivo) + '</td><td class="text-center">' + rotEscHtml(det.supervisor || '—') + '</td></tr>';
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
                    <img src="https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500" alt="Logo Empresa" style="max-width: 100%; max-height: 45px; object-fit: contain;">
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
                  + '<button id="btnPrint" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>\n'
                  + htmlBody
                  + '\n</body>\n</html>';

    var win = window.open('', '_blank');
    win.document.open();
    win.document.write(finalHtml);
    win.document.close();
    win.onload = function() {
        setTimeout(function() {
            win.print();
        }, 500);
    };
};

window.rotGenerarPlantillaVaciaOT = function(idOt, placa) {
    if (typeof window.rotToast === 'function') window.rotToast('Generando plantilla...', 'bg-info');
    window.generarPDF_OT({ id_ot: idOt, placa: placa }, [], []);
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
    return typeof iso === 'string' ? iso.split('T')[0] : '';
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
    var map = {
        'En atención':            ['rot-b-en-atencion', 'En Atención'],
        'Espera de repuesto':     ['rot-b-espera',      'Espera Repuesto'],
        'Espera de autorización': ['rot-b-espera',      'Espera Autor.'],
        'Finalizado':             ['rot-b-cerrada',     'Finalizado']
    };
    var v = map[sit] || [null, sit];
    return v[0] ? '<span class="rot-badge ' + v[0] + '">' + v[1] + '</span>' : rotEscHtml(sit);
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
            var ticket = rotEscHtml(String(t.ticket_visita || ''));
            html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.81rem;cursor:pointer;" onclick="window.rotEditarTrabajo(\'' + ticket + '\',\'' + rotEscHtml(idOt) + '\')">'
                  + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">'
                  + '<div><span style="font-weight:700;color:var(--primary,#5865F2);font-size:0.72rem;">' + ticket + '</span> ' + bdg + '</div>'
                  + (det2.costo ? '<span style="font-weight:700;color:#16a34a;font-size:0.78rem;">S/' + parseFloat(det2.costo).toFixed(2) + '</span>' : '')
                  + '</div>'
                  + '<div style="color:var(--text);margin-top:3px;">' + rotEscHtml(t.trabajo_realizado || '—') + '</div>'
                  + (det2.personal ? '<div style="font-size:0.75rem;color:var(--subtext);margin-top:2px;"><i class="bi bi-person me-1"></i>' + rotEscHtml(det2.personal) + '</div>' : '')
                  + ((fecIni || fecFin) ? '<div style="font-size:0.75rem;color:var(--subtext);margin-top:1px;"><i class="bi bi-calendar me-1"></i>' + fecIni + (fecFin ? ' → ' + fecFin : '') + '</div>' : '')
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
                  + '<div style="color:var(--subtext);font-size:0.7rem;">' + fIngreso + ' • KM: ' + (i.km_tablero || 0) + '</div>'
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
window.rotEditarTrabajo = function(ticket, idOt) {
    var t = window.rotOtTrabajosActivos.find(function(x){ return String(x.ticket_visita || '') === String(ticket); });
    if (!t) return;
    var det2 = {};
    try { det2 = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); } catch(e) {}

    var lbl  = document.getElementById('rot-tr-ot-lbl');      if (lbl)  lbl.textContent = idOt;
    var hid  = document.getElementById('rot-tr-ot-id');        if (hid)  hid.value = idOt;
    var hid2 = document.getElementById('rot-tr-ticket-hid');   if (hid2) hid2.value = ticket;
    var desc = document.getElementById('rot-tr-desc');         if (desc) desc.value = t.trabajo_realizado || '';
    var cos  = document.getElementById('rot-tr-costo');        if (cos)  cos.value  = det2.costo !== undefined ? det2.costo : '0';

    var toLocalDT = function(iso) {
        if (!iso) return '';
        var s = String(iso);
        return s.indexOf('T') !== -1 ? s.slice(0,16) : s.slice(0,16);
    };
    var fi = document.getElementById('rot-tr-fecha-ini'); if (fi) fi.value = toLocalDT(t.fecha_trabajo || '');
    var ff = document.getElementById('rot-tr-fecha-fin'); if (ff) ff.value = toLocalDT(t.fecha_salida  || '');
    var tit = document.getElementById('rot-tr-drawer-titulo'); if (tit) tit.textContent = 'Editar Trabajo ' + ticket;
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
    var vis = document.getElementById('rot-mat-ot-vis'); if (vis) vis.value = idOt;

    // Pre-llenar fecha de hoy
    var hoy = new Date();
    var fechaHoy = hoy.getFullYear() + '-' +
        String(hoy.getMonth()+1).padStart(2,'0') + '-' +
        String(hoy.getDate()).padStart(2,'0');
    var fecEl = document.getElementById('rot-mat-fecha'); if (fecEl) fecEl.value = fechaHoy;

    // Pre-llenar placa desde la OT activa
    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOt); });
    var placa = ot ? (ot.placa || '') : '';
    var placaEl = document.getElementById('rot-mat-placa'); if (placaEl) placaEl.value = placa;

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
            if (window.SS) window.SS.init('rot-placa', 'rot-mat-placa', lista, '', null, 'Buscar placa…');
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
    tr.innerHTML =
        '<td>' +
            '<input type="text" class="form-control form-control-sm rot-mat-item-desc" list="rot-mat-inv-list" placeholder="Artículo…" data-idx="' + idx + '" oninput="window._rotBuscarArtMat(this,' + idx + ')">' +
            '<input type="hidden" class="rot-mat-item-inv-id" data-idx="' + idx + '">' +
            '<input type="hidden" class="rot-mat-item-stock" data-idx="' + idx + '" value="">' +
            '<div class="rot-mat-item-stock-lbl" data-idx="' + idx + '" style="font-size:0.71rem;margin-top:2px;display:none;"></div>' +
        '</td>' +
        '<td><input type="number" class="form-control form-control-sm rot-mat-item-cant" data-idx="' + idx + '" value="1" min="0.001" step="0.001" oninput="window._rotCalcItemMat(' + idx + ')"></td>' +
        '<td><input type="number" class="form-control form-control-sm rot-mat-item-cu" data-idx="' + idx + '" value="0" min="0" step="0.01" oninput="window._rotCalcItemMat(' + idx + ')"></td>' +
        '<td><input type="number" class="form-control form-control-sm rot-mat-item-imp" data-idx="' + idx + '" value="0" readonly></td>' +
        '<td><button type="button" class="btn btn-sm btn-outline-danger" onclick="window._rotQuitarItemMat(' + idx + ')"><i class="bi bi-x"></i></button></td>';
    tbody.appendChild(tr);
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
                lblEl.innerHTML = '<span style="color:#dc2626;font-weight:700;">⚠ Sin stock disponible</span>';
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
            window.mostrarAlerta('Stock insuficiente:\n• ' + sinStock.join('\n• '), 'danger');
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
function rotAbrirSubDrawer(id) {
    var d = document.getElementById(id);
    if (d) d.classList.add('open');
}

window.rotCerrarSubDrawer = function(drawerId) {
    var d = document.getElementById(drawerId);
    if (d) d.classList.remove('open');
};

// ── Multiselect Personal (Agregar/Editar Trabajo) ────────────────
window._rotPersonalLista = window._rotPersonalLista || [];
window._rotSeleccionados = window._rotSeleccionados || [];

function rotMsInit(valorActual) {
    window._rotSeleccionados = valorActual
        ? valorActual.split(',').map(function(n){ return n.trim(); }).filter(Boolean)
        : [];
    rotMsRenderBox();
    var dd = document.getElementById('rot-ms-dropdown');
    if (dd) dd.style.display = 'none';
    var s = document.getElementById('rot-ms-search');
    if (s) s.value = '';
    var cnt = document.getElementById('rot-ms-count');
    if (cnt) cnt.textContent = window._rotSeleccionados.length + ' seleccionados';
    var hidden = document.getElementById('rot-tr-personal');
    if (hidden) hidden.value = window._rotSeleccionados.join(', ');

    var doRender = function() { rotMsRenderOptions(''); };
    if (window._rotPersonalLista.length > 0) { doRender(); return; }
    fetch('/api/conductores')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            var lista = Array.isArray(data) ? data : (data.data || []);
            window._rotPersonalLista = lista.map(function(p) {
                var n = (p.nombre_completo || p.nombre || '').trim();
                return n.split(' ').map(function(w) {
                    return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '';
                }).join(' ');
            }).filter(Boolean).sort();
            doRender();
        })
        .catch(function() {});
}

window.rotMsToggle = function() {
    var dd = document.getElementById('rot-ms-dropdown');
    var box = document.getElementById('rot-ms-box');
    if (!dd) return;
    var isOpen = dd.style.display !== 'none';
    if (isOpen) {
        dd.style.display = 'none';
        if (box) box.style.borderColor = '';
    } else {
        dd.style.display = 'block';
        if (box) box.style.borderColor = 'var(--primary, #5865F2)';
        var search = document.getElementById('rot-ms-search');
        if (search) { search.value = ''; search.focus(); }
        rotMsRenderOptions('');
    }
};

window.rotMsFiltrar = function(query) { rotMsRenderOptions(query || ''); };

function rotMsRenderOptions(query) {
    var container = document.getElementById('rot-ms-options');
    if (!container) return;
    var q = (query || '').toLowerCase();
    var filtrados = window._rotPersonalLista.filter(function(n) {
        return !q || n.toLowerCase().indexOf(q) !== -1;
    });
    if (filtrados.length === 0) {
        container.innerHTML = '<div style="padding:10px 14px; color:var(--subtext); font-size:0.83rem; text-align:center;">Sin resultados</div>';
        return;
    }
    container.innerHTML = filtrados.map(function(n) {
        var checked = window._rotSeleccionados.indexOf(n) !== -1;
        var nEsc = n.replace(/'/g, "\\'");
        return '<label style="display:flex; align-items:center; gap:10px; padding:9px 14px; cursor:pointer; font-size:0.85rem; color:var(--text);" '
            + 'onmouseenter="this.style.background=\'var(--bg)\'" onmouseleave="this.style.background=\'\'">'
            + '<input type="checkbox" ' + (checked ? 'checked' : '') + ' '
            + 'onclick="event.stopPropagation(); rotMsToggleItem(\'' + nEsc + '\')" '
            + 'style="accent-color:var(--primary, #5865F2); width:14px; height:14px; cursor:pointer; flex-shrink:0;">'
            + n + '</label>';
    }).join('');
}

window.rotMsToggleItem = function(nombre) {
    var idx = window._rotSeleccionados.indexOf(nombre);
    if (idx === -1) window._rotSeleccionados.push(nombre);
    else window._rotSeleccionados.splice(idx, 1);
    rotMsRenderBox();
    rotMsRenderOptions((document.getElementById('rot-ms-search') || {}).value || '');
    var cnt = document.getElementById('rot-ms-count');
    if (cnt) cnt.textContent = window._rotSeleccionados.length + ' seleccionados';
    var hidden = document.getElementById('rot-tr-personal');
    if (hidden) hidden.value = window._rotSeleccionados.join(', ');
};

window.rotMsLimpiar = function() {
    window._rotSeleccionados = [];
    rotMsRenderBox();
    rotMsRenderOptions('');
    var cnt = document.getElementById('rot-ms-count');
    if (cnt) cnt.textContent = '0 seleccionados';
    var hidden = document.getElementById('rot-tr-personal');
    if (hidden) hidden.value = '';
};

function rotMsRenderBox() {
    var box = document.getElementById('rot-ms-box');
    if (!box) return;
    var sel = window._rotSeleccionados;
    if (sel.length === 0) {
        box.innerHTML = '<span style="color:var(--subtext); font-size:0.85rem;">Selecciona técnico(s)...</span>';
    } else {
        box.innerHTML = sel.map(function(n) {
            var nEsc = n.replace(/'/g, "\\'");
            return '<span style="display:inline-flex; align-items:center; gap:4px; background:var(--primary, #5865F2); color:#fff; padding:3px 8px 3px 10px; border-radius:6px; font-size:0.76rem; font-weight:600;">'
                + n
                + '<span style="cursor:pointer; opacity:0.8; font-size:1rem; line-height:1;" '
                + 'onmousedown="event.stopPropagation(); event.preventDefault(); rotMsToggleItem(\'' + nEsc + '\')">×</span>'
                + '</span>';
        }).join('');
    }
}

window._rotMsOutsideClick = function(e) {
    var wrapper = document.getElementById('rot-ms-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        var dd = document.getElementById('rot-ms-dropdown');
        var box = document.getElementById('rot-ms-box');
        if (dd) dd.style.display = 'none';
        if (box) box.style.borderColor = '';
    }
};
document.removeEventListener('click', window._rotMsOutsideClick);
document.addEventListener('click', window._rotMsOutsideClick);


// ── Render sección Backlog ────────────────────────────────────────
function rotRenderSecBacklog(items) {
    var body  = document.getElementById('rot-bkg-body');
    var count = document.getElementById('rot-bkg-count');
    if (!body) return;
    if (count) count.textContent = items.length;

    if (!items.length) {
        body.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;">No hay pendientes para esta unidad</div>';
        return;
    }

    var html = '';
    items.forEach(function(b) {
        html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.81rem;">'
              + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">'
              + '<div><span style="font-weight:700;font-size:0.72rem;color:#d97706;">' + rotEscHtml(b.backlog_id || String(b.id)) + '</span>'
              + (b.tema ? ' <span style="font-size:0.72rem;color:var(--subtext);">' + rotEscHtml(b.tema) + '</span>' : '') + '</div>'
              + '<div style="display:flex;gap:4px;">'
              + '<button class="btn btn-sm" style="padding:1px 7px;font-size:0.7rem;background:rgba(22,163,74,0.1);color:#16a34a;font-weight:700;border-radius:12px;" '
              + 'onclick="event.stopPropagation();window.rotMarcarBacklogRealizado(' + b.id + ',this)" title="Marcar como Realizado">✓ Realizado</button>'
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
window.rotAbrirAgregarBacklog = function(placa) {
    var lbl = document.getElementById('rot-bkg-placa-lbl'); if (lbl) lbl.textContent = 'Placa: ' + placa;
    var hid = document.getElementById('rot-bkg-placa-hid'); if (hid) hid.value = placa;
    var tema = document.getElementById('rot-bkg-tema');       if (tema) tema.value = '';
    var tarea = document.getElementById('rot-bkg-tarea');     if (tarea) tarea.value = '';
    var rep   = document.getElementById('rot-bkg-reportado-por'); if (rep) rep.value = '';
    rotAbrirSubDrawer('rot-drawer-backlog');
};

// ── Guardar nuevo backlog ─────────────────────────────────────────
window.rotGuardarBacklog = function() {
    var placa = ((document.getElementById('rot-bkg-placa-hid')     || {}).value || '').trim();
    var tema  = ((document.getElementById('rot-bkg-tema')          || {}).value || '').trim();
    var tarea = ((document.getElementById('rot-bkg-tarea')         || {}).value || '').trim();
    var rep   = ((document.getElementById('rot-bkg-reportado-por') || {}).value || '').trim();

    if (!placa || !tarea) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La descripción es requerida', 'danger'); return; }
    var user = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
    fetch('/api/ot-backlog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: placa, tema: tema, tarea: tarea, reportado_por: rep || user, estado: 'Pendiente', creado_por: user })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        window.rotCerrarSubDrawer('rot-drawer-backlog');
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Mantenimiento pendiente agregado', 'success');
        // Recargar backlog
        fetch('/api/ot-backlog?placa=' + encodeURIComponent(placa) + '&estado=Pendiente')
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(items) { rotRenderSecBacklog(Array.isArray(items) ? items : []); })
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
        if (btn) {
            var row = btn.closest ? btn.closest('[style]') : btn.parentNode.parentNode;
            if (row && row.parentNode) row.parentNode.removeChild(row);
            var count = document.getElementById('rot-bkg-count');
            if (count) count.textContent = Math.max(0, (parseInt(count.textContent) || 1) - 1);
        }
    })
    .catch(function() {
        if (btn) { btn.disabled = false; btn.innerHTML = '✓ Realizado'; }
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

function rotAbrirEditarOT(idOT) {
    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
    if (!ot) return;
    var det = rotDetalles(ot);

    // Asegurar que el select de situaciones tenga las opciones cargadas
    rotPoblarSelectSituacion();

    var set = function(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
    set('rot-eot-id',         idOT);
    set('rot-eot-supervisor', det.supervisor || ot.supervisor || '');
    set('rot-eot-motivo',     det.motivo || ot.observaciones || '');

    // Situación
    var sitEl = document.getElementById('rot-eot-situacion');
    if (sitEl) sitEl.value = det.situacion_inicial || ot.situacion || '';

    // Tipo OT
    var tipoEl = document.getElementById('rot-eot-tipo');
    if (tipoEl) {
        tipoEl.value = det.tipo_ot || '';
        // Disparar cascade
        rotCambiarTipoEOT();
    }
    // Sub tipo (after cascade)
    setTimeout(function() {
        var subEl = document.getElementById('rot-eot-subtipo');
        if (subEl) subEl.value = det.sub_tipo || '';
    }, 50);

    rotAbrirSubDrawer('rot-drawer-editar-ot');
}

window.rotCambiarTipoEOT = function() {
    var tipo = ((document.getElementById('rot-eot-tipo') || {}).value || '');
    var sel  = document.getElementById('rot-eot-subtipo');
    if (!sel) return;
    var opts = ROT_SUBTIPOS[tipo] || [];
    sel.innerHTML = '<option value="">— Seleccionar —</option>' + opts.map(function(s) {
        return '<option value="' + s + '">' + s + '</option>';
    }).join('');
    sel.disabled = !opts.length;
};

window.rotGuardarEdicionOT = function() {
    var idOT       = ((document.getElementById('rot-eot-id')         || {}).value || '').trim();
    var tipo       = ((document.getElementById('rot-eot-tipo')       || {}).value || '').trim();
    var subtipo    = ((document.getElementById('rot-eot-subtipo')    || {}).value || '').trim();
    var supervisor = ((document.getElementById('rot-eot-supervisor') || {}).value || '').trim();
    var situacion  = ((document.getElementById('rot-eot-situacion')  || {}).value || '').trim();
    var motivo     = ((document.getElementById('rot-eot-motivo')     || {}).value || '').trim();

    if (!idOT) return;

    fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            accion:             'editar',
            tipo_ot:            tipo,
            sub_tipo:           subtipo,
            supervisor:         supervisor,
            situacion_inicial:  situacion,
            motivo:             motivo
        })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        window.rotCerrarSubDrawer('rot-drawer-editar-ot');
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT actualizada correctamente', 'success');
        window.rotCargar();
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
                    <img src="https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500" alt="Logo Empresa" style="max-width: 100%; max-height: 45px; object-fit: contain;">
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
    
    // Fetch trabajos y materiales si no los tenemos
    Promise.all([
        fetch('/api/ot-trabajos?id_ot=' + encodeURIComponent(idOT)).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOT)).then(r => r.ok ? r.json() : []).catch(() => [])
    ]).then(function(res) {
        var trabajos = Array.isArray(res[0]) ? res[0] : [];
        var materiales = Array.isArray(res[1]) ? res[1] : [];
        var ot = window.rotData.find(function(o) { return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
        
        if (!ot) {
            alert('OT no encontrada.');
            return;
        }

        // Usamos un pequeño truco: llamamos a la misma función generarPDF_OT, pero sobreescribimos temporalmente window.open
        var originalOpen = window.open;
        var modalContentHtml = '';

        window.open = function() {
            return {
                document: {
                    open: function() {},
                    write: function(htmlStr) {
                        modalContentHtml = htmlStr;
                    },
                    close: function() {}
                },
                print: function() {},
                onload: null
            };
        };

        window.generarPDF_OT(ot, trabajos, materiales);
        
        // Restaurar window.open
        window.open = originalOpen;

        // Quitar el botón de imprimir del htmlStr porque aquí solo vamos a ver (y si queremos imprimir le ponemos un botón nativo del modal)
        modalContentHtml = modalContentHtml.replace('<button id="btnPrint" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>', '');

        // Mostrar en un modal con iframe
        if (!document.getElementById('modalFormatoOT')) {
            var m = document.createElement('div');
            m.innerHTML = '<div class="modal fade" id="modalFormatoOT" tabindex="-1" aria-hidden="true">'
                        + '  <div class="modal-dialog modal-xl modal-dialog-scrollable">'
                        + '    <div class="modal-content" style="height: 90vh;">'
                        + '      <div class="modal-header py-2" style="background:#f8fafc;">'
                        + '        <h5 class="modal-title fw-bold" style="font-size:15px; color:#1e293b;"><i class="bi bi-file-earmark-text text-primary"></i> Detalle de OT ' + rotEscHtml(idOT) + '</h5>'
                        + '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>'
                        + '      </div>'
                        + '      <div class="modal-body p-0" style="background:#e0e0e0; display:flex; justify-content:center;">'
                        + '         <iframe id="iframeFormatoOT" style="width:100%; height:100%; border:none;"></iframe>'
                        + '      </div>'
                        + '      <div class="modal-footer py-2" style="background:#f8fafc;">'
                        + '        <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Cerrar</button>'
                        + '        <button type="button" class="btn btn-sm btn-primary" onclick="window.generarPDF_OT(window.rotData.find(o=>String(o.ticket_entrada||o.id_ot)===String(\'' + idOT + '\')), window.currentVerTrabajos, window.currentVerMateriales)"><i class="bi bi-printer"></i> Imprimir</button>'
                        + '      </div>'
                        + '    </div>'
                        + '  </div>'
                        + '</div>';
            document.body.appendChild(m.firstChild);
        } else {
            // Actualizar título y botón imprimir
            var btnPrint = document.querySelector('#modalFormatoOT .btn-primary');
            if(btnPrint) {
                btnPrint.setAttribute('onclick', "window.generarPDF_OT(window.rotData.find(o=>String(o.ticket_entrada||o.id_ot)===String('" + idOT + "')), window.currentVerTrabajos, window.currentVerMateriales)");
            }
            var title = document.querySelector('#modalFormatoOT .modal-title');
            if(title) {
                title.innerHTML = '<i class="bi bi-file-earmark-text text-primary"></i> Detalle de OT ' + rotEscHtml(idOT);
            }
        }

        window.currentVerTrabajos = trabajos;
        window.currentVerMateriales = materiales;
        var myModal = new bootstrap.Modal(document.getElementById('modalFormatoOT'));
        myModal.show();

        setTimeout(function() {
            var iframe = document.getElementById('iframeFormatoOT');
            if (iframe) {
                iframe.srcdoc = modalContentHtml;
            }
        }, 100);

    });
};



window.rotAbrirEditarFechas = function(idOT) {
    if (!window.guardAction('ot', 'e')) return;
    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
    if (!ot) return;
    
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
        window.rotCargar();
    })
    .catch(function(e) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al actualizar las fechas.', 'danger');
    });
};
