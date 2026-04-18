// ================================================================
// Módulo Status Rampa — Azkell Fleet
// Modelo: window.srEntradas = lista dinámica (N entradas por rampa)
// ================================================================

// Variables de estado (solo las que no vienen de BD)
window.srDetalleId            = window.srDetalleId            || null;
window.srOtData               = window.srOtData               || [];
window.srCatSituaciones       = window.srCatSituaciones       || [];
window.srOtTrabajosActivos    = window.srOtTrabajosActivos    || [];
window.srOtMaterialesActivos  = window.srOtMaterialesActivos  || [];
// srEntradas se carga desde BD — no se persiste en localStorage
window.srEntradas             = [];

var SR_COLORES = [
    '#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6',
    '#14b8a6','#f97316','#ec4899','#84cc16','#06b6d4','#a855f7'
];

// ── Entry point ──────────────────────────────────────────────────
window.init_status_rampa = function() {
    srCargarCatalogos();
    srCargarEntradas();
    srCargarOTs();
    srPoblarPlacas();
    srPoblarPersonal();
};

// ── Carga entradas desde BD ──────────────────────────────────────
function srCargarEntradas() {
    fetch('/api/taller-rampas')
        .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function(rows) {
            window.srEntradas = rows.map(function(r) {
                return {
                    _id:          r.id,
                    rampa:        r.rampa,
                    placa:        r.placa,
                    km:           r.km || '',
                    fechaIngreso: r.fecha_ingreso ? String(r.fecha_ingreso).split('T')[0] : '',
                    horaIngreso:  r.hora_ingreso  ? String(r.hora_ingreso).slice(0,5) : '',
                    fechaSalida:  r.fecha_salida  ? String(r.fecha_salida).split('T')[0] : '',
                    horaSalida:   r.hora_salida   ? String(r.hora_salida).slice(0,5) : '',
                    situacion:    r.situacion || '',
                    obs:          r.obs || ''
                };
            });
            srRenderTabla();
            if (window.srDetalleId !== null) window.srAbrirDetalle(window.srDetalleId);
        })
        .catch(function() { window.srEntradas = []; srRenderTabla(); });
}

// ── Catálogos ────────────────────────────────────────────────────
function srCargarCatalogos() {
    fetch('/api/catalogos_taller')
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(d) {
            if (!d) return;
            window.srCatSituaciones = d.situaciones || [];

            // Selector Registrar
            var sel = document.getElementById('sr-f-situacion');
            if (sel && window.srCatSituaciones.length) {
                sel.innerHTML = window.srCatSituaciones.map(function(s) {
                    var l = s.descripcion || s.nombre || '';
                    return '<option value="' + l + '">' + l + '</option>';
                }).join('');
            }
            // Selector Situación Inicial en OT
            var selOT = document.getElementById('sr-ot-situacion');
            if (selOT && window.srCatSituaciones.length) {
                selOT.innerHTML = '<option value="">— Seleccionar —</option>' +
                    window.srCatSituaciones.map(function(s) {
                        var l = s.descripcion || s.nombre || '';
                        return '<option value="' + l + '">' + l + '</option>';
                    }).join('');
            }
        })
        .catch(function() {});
}

// ── Placas datalist ──────────────────────────────────────────────
function srPoblarPlacas() {
    var dl = document.getElementById('sr-placas-dl');
    if (!dl) return;
    var vistas = {};
    var html = '';
    (window.dataGlobalPlacas || []).forEach(function(r) {
        var p = String(Array.isArray(r) ? (r[0] || '') : (r.placa || r[0] || '')).trim().toUpperCase();
        if (!p || p === 'PLACA' || vistas[p]) return;
        vistas[p] = true;
        html += '<option value="' + p + '">';
    });
    dl.innerHTML = html;
}

// ── Personal / Supervisor ────────────────────────────────────────
function srPoblarPersonal() {
    var selSupervisor = document.getElementById('sr-ot-supervisor');
    var selTecnico    = document.getElementById('sr-tr-personal');
    if (!selSupervisor && !selTecnico) return;
    fetch('/api/conductores')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(d) {
            var lista = Array.isArray(d) ? d : (d.data || []);
            var opts = lista.map(function(p) {
                var n = (p.nombre_completo || p.nombre || (p[1] ? p[1] + ' ' + (p[2] || '') : '')).trim();
                return n ? '<option value="' + n + '">' + n + '</option>' : '';
            }).join('');
            if (selSupervisor) selSupervisor.innerHTML = '<option value="">— Seleccionar supervisor —</option>' + opts;
            if (selTecnico)    selTecnico.innerHTML    = '<option value="">— Seleccionar técnico —</option>'   + opts;
        })
        .catch(function() {});
}

// ── Carga OTs ────────────────────────────────────────────────────
function srCargarOTs() {
    fetch('/api/ordenes-trabajo')
        .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function(data) {
            window.srOtData = Array.isArray(data) ? data : [];
            srRenderTabla();
            if (window.srDetalleId !== null) window.srAbrirDetalle(window.srDetalleId);
        })
        .catch(function() { window.srOtData = []; srRenderTabla(); });
}

// ── Render tabla ─────────────────────────────────────────────────
function srRenderTabla() {
    var tbody = document.getElementById('sr-tbody');
    if (!tbody) return;

    var busq = ((document.getElementById('sr-buscador') || {}).value || '').trim().toLowerCase();
    var html  = '';

    for (var rampa = 1; rampa <= 12; rampa++) {
        var color    = SR_COLORES[rampa - 1];
        var entradas = window.srEntradas.filter(function(e) { return e.rampa === rampa; });

        if (!entradas.length) {
            // Fila vacía
            if (!busq || String(rampa).indexOf(busq) !== -1) {
                html += '<tr class="sr-row-vacia">';
                html += '<td><span class="sr-badge-rampa" style="background:' + color + '">' + rampa + '</span></td>';
                html += '<td></td><td></td><td></td>';
                html += '<td><span class="sr-semaforo sr-sem-vacio"><span class="sr-sem-dot"></span>Libre</span></td>';
                html += '<td></td><td></td><td></td><td></td>';
                html += '<td><button class="btn-sr-reg" onclick="event.stopPropagation();window.srRegistrar(' + rampa + ')"><i class="bi bi-plus-lg me-1"></i>Ingresar</button></td>';
                html += '</tr>';
            }
            continue;
        }

        entradas.forEach(function(e) {
            if (busq) {
                var match = String(e.rampa).indexOf(busq) !== -1 ||
                    (e.placa || '').toLowerCase().indexOf(busq) !== -1 ||
                    (e.situacion || '').toLowerCase().indexOf(busq) !== -1 ||
                    (e.obs || '').toLowerCase().indexOf(busq) !== -1;
                if (!match) return;
            }
            var esActiva = (window.srDetalleId === e._id);
            var otsPlaca = window.srOtData.filter(function(o) {
                return (o.placa || '').toUpperCase() === e.placa.toUpperCase();
            });
            var otsTxt = otsPlaca.length
                ? otsPlaca.slice(0,3).map(function(o) {
                    return '<span class="badge" style="background:rgba(88,101,242,0.1);color:var(--primary,#5865F2);font-weight:700;font-size:0.68rem;margin-right:3px;">' + (o.id_ot || o.ticket_entrada || '—') + '</span>';
                  }).join('') + (otsPlaca.length > 3 ? '<span style="font-size:0.72rem;color:var(--subtext)">+' + (otsPlaca.length - 3) + '</span>' : '')
                : '<span style="color:var(--subtext);font-size:0.8rem;">—</span>';

            html += '<tr class="sr-ocupada' + (esActiva ? ' sr-activa' : '') + '" onclick="window.srAbrirDetalle(' + e._id + ')">';
            html += '<td><span class="sr-badge-rampa" style="background:' + color + '">' + rampa + '</span></td>';
            html += '<td>' + (e.fechaIngreso ? srFmtFecha(e.fechaIngreso) : '') + '</td>';
            html += '<td>' + (e.horaIngreso || '') + '</td>';
            html += '<td style="font-weight:700;">' + (e.placa || '') + '</td>';
            html += '<td>' + srBadgeSituacion(e.situacion, true) + '</td>';
            html += '<td style="color:var(--subtext);font-size:0.8rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (e.obs || '') + '">' + (e.obs || '') + '</td>';
            html += '<td>' + (e.fechaSalida ? srFmtFecha(e.fechaSalida) : '') + '</td>';
            html += '<td>' + (e.horaSalida || '') + '</td>';
            html += '<td>' + otsTxt + '</td>';
            html += '<td>';
            html += '<button class="btn btn-sm btn-outline-secondary" style="font-size:0.72rem;padding:2px 8px;" onclick="event.stopPropagation();window.srEditarRampa(' + e._id + ')" title="Editar"><i class="bi bi-pencil"></i></button> ';
            html += '<button class="btn btn-sm btn-outline-danger" style="font-size:0.72rem;padding:2px 8px;" onclick="event.stopPropagation();window.srLiberarRampa(' + e._id + ')" title="Liberar"><i class="bi bi-box-arrow-right"></i></button>';
            html += '</td></tr>';
        });
    }

    if (!html) {
        html = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--subtext);font-size:0.85rem;">Sin resultados.</td></tr>';
    }
    tbody.innerHTML = html;
}

// ── Buscador ─────────────────────────────────────────────────────
window.srBuscar = function() {
    srRenderTabla();
    if (window.srDetalleId !== null) {
        // cerrar panel si la entrada activa ya no es visible
        if (!document.querySelector('#sr-tbody tr.sr-activa')) window.srCerrarDetalle();
    }
};

// ── Panel detalle ────────────────────────────────────────────────
window.srAbrirDetalle = function(id) {
    var e = window.srEntradas.find(function(x) { return x._id === id; });
    if (!e) return;

    window.srDetalleId = id;
    srRenderTabla();

    var panel  = document.getElementById('sr-panel-detalle');
    var scroll = document.getElementById('sr-detalle-scroll');
    var footer = document.getElementById('sr-detalle-footer');
    if (!panel || !scroll || !footer) return;
    panel.classList.add('open');

    var color = SR_COLORES[e.rampa - 1];

    // Horas: entre ingreso y salida estimada (o hasta ahora si no hay salida)
    var horasTexto = '';
    if (e.fechaIngreso && e.horaIngreso) {
        var entrada = new Date(e.fechaIngreso + 'T' + e.horaIngreso);
        var referencia = (e.fechaSalida && e.horaSalida)
            ? new Date(e.fechaSalida + 'T' + e.horaSalida)
            : new Date();
        var diffH = Math.round((referencia - entrada) / 36e5);
        var label = (e.fechaSalida && e.horaSalida) ? ' h estimadas' : ' h en taller';
        horasTexto = '<span style="font-size:0.78rem;color:var(--subtext);"><i class="bi bi-clock me-1"></i>' + diffH + label + '</span>';
    }

    var otsPlaca = window.srOtData.filter(function(o) {
        return (o.placa || '').toUpperCase() === e.placa.toUpperCase();
    });

    var html = '';
    // Hero
    html += '<div class="sr-hero">';
    html += '<div class="sr-hero-badge" style="background:' + color + '">' + e.rampa + '</div>';
    html += '<div style="flex:1"><div class="sr-hero-placa">' + e.placa + '</div>';
    html += '<div class="sr-hero-sub">' + srSemaforo(e.situacion, true) + '</div></div>';
    html += '</div>';
    if (horasTexto) html += '<div style="margin-bottom:0.75rem;">' + horasTexto + '</div>';

    // I. Recepción
    html += '<div class="sr-sec"><div class="sr-sec-hd">I. Recepción</div>';
    html += srField('Rampa',         'N° ' + e.rampa);
    html += srField('Ingreso a Taller', (e.fechaIngreso ? srFmtFecha(e.fechaIngreso) : '—') + (e.horaIngreso ? ' ' + e.horaIngreso : ''));
    html += srField('Situación',     e.situacion ? srSemaforo(e.situacion, true) : '—');
    html += srField('Observaciones', e.obs || '—');
    if (e.fechaSalida) html += srField('Salida Estimada', srFmtFecha(e.fechaSalida) + (e.horaSalida ? ' ' + e.horaSalida : ''));
    html += '</div>';

    // OTs generadas
    html += '<div class="sr-sec" style="margin-top:1rem">';
    html += '<div class="sr-sec-hd">OT Generadas <span style="background:rgba(88,101,242,0.12);color:var(--primary,#5865F2);border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:6px;">' + otsPlaca.length + '</span></div>';
    if (!otsPlaca.length) {
        html += '<div class="sr-empty">No hay elementos</div>';
    } else {
        html += '<table class="sr-mini-table"><thead><tr><th>N° OT</th><th>Aprobación</th><th>Situación</th></tr></thead><tbody>';
        otsPlaca.forEach(function(ot) {
            var det = {};
            try { det = typeof ot.detalles_json === 'string' ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {}); } catch(ex) {}
            var idOt = ot.id_ot || ot.ticket_entrada || '—';
            html += '<tr style="cursor:pointer;" onclick="window.srAbrirDetalleOT(\'' + idOt + '\')">';
            html += '<td style="font-weight:700;color:var(--primary,#5865F2);">' + idOt + '</td>';
            html += '<td>' + srBadgeEstado(ot.estado || 'Pendiente') + '</td>';
            html += '<td>' + (det.situacion_inicial ? srSemaforo(det.situacion_inicial, true) : '—') + '</td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
    }
    html += '<div style="padding:8px 12px;border-top:1px solid var(--border);">';
    html += '<button class="btn btn-sm btn-outline-primary w-100" onclick="window.srGenerarOT(' + id + ')">';
    html += '<i class="bi bi-file-earmark-plus me-1"></i>Generar Orden de Trabajo</button></div>';
    html += '</div>';

    scroll.innerHTML = html;
    footer.innerHTML =
        '<button class="btn btn-sm btn-outline-secondary" onclick="window.srEditarRampa(' + id + ')"><i class="bi bi-pencil me-1"></i>Editar Ingreso</button>' +
        '<button class="btn btn-sm btn-outline-danger ms-auto" onclick="window.srLiberarRampa(' + id + ')"><i class="bi bi-box-arrow-right me-1"></i>Liberar</button>';
    footer.style.display = 'flex';
};

window.srCerrarDetalle = function() {
    var panel = document.getElementById('sr-panel-detalle');
    if (panel) panel.classList.remove('open');
    window.srDetalleId = null;
    srRenderTabla();
};

// ── Registrar nueva unidad ───────────────────────────────────────
window.srRegistrar = function(rampaNr) {
    srLimpiarFormRegistro();
    var titulo = document.getElementById('sr-drawer-titulo');
    if (titulo) titulo.textContent = 'Registrar Unidad en Rampa';
    var hid = document.getElementById('sr-f-idx');
    if (hid) hid.value = ''; // vacío = nueva entrada

    if (rampaNr) {
        var selRampa = document.getElementById('sr-f-rampa');
        if (selRampa) selRampa.value = String(rampaNr);
    }
    var hoy = new Date();
    var fecIng = document.getElementById('sr-f-fecha-ing');
    if (fecIng) fecIng.value = hoy.toISOString().split('T')[0];
    var horIng = document.getElementById('sr-f-hora-ing');
    if (horIng) horIng.value = hoy.toTimeString().slice(0, 5);
    srAbrirDrawer('sr-drawer-registro');
};

// ── Editar entrada existente ─────────────────────────────────────
window.srEditarRampa = function(id) {
    var e = window.srEntradas.find(function(x) { return x._id === id; });
    if (!e) return;
    srLimpiarFormRegistro();
    var titulo = document.getElementById('sr-drawer-titulo');
    if (titulo) titulo.textContent = 'Editar Rampa ' + e.rampa;
    var hid = document.getElementById('sr-f-idx');
    if (hid) hid.value = String(id);

    var sR = document.getElementById('sr-f-rampa');
    if (sR) { sR.value = String(e.rampa); sR.disabled = true; }

    var set = function(eid, val) { var el = document.getElementById(eid); if (el) el.value = val || ''; };
    set('sr-f-placa',     e.placa);
    set('sr-f-km',        e.km);
    set('sr-f-fecha-ing', e.fechaIngreso);
    set('sr-f-hora-ing',  e.horaIngreso);
    set('sr-f-fecha-sal', e.fechaSalida);
    set('sr-f-hora-sal',  e.horaSalida);
    set('sr-f-obs',       e.obs);
    var esi = document.getElementById('sr-f-situacion');
    if (esi) esi.value = e.situacion || '';
    srAbrirDrawer('sr-drawer-registro');
};

// ── Liberar entrada ──────────────────────────────────────────────
window.srLiberarRampa = function(id) {
    var e = window.srEntradas.find(function(x) { return x._id === id; });
    if (!e) return;
    if (!confirm('¿Confirmar salida de ' + e.placa + ' de la Rampa ' + e.rampa + '?')) return;
    fetch('/api/taller-rampas/' + id, { method: 'DELETE' })
        .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function() {
            if (window.srDetalleId === id) window.srCerrarDetalle();
            srCargarEntradas();
        })
        .catch(function() {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al liberar rampa', 'danger');
        });
};

// ── Guardar registro (nueva o edición) ──────────────────────────
window.srGuardarRegistro = function() {
    var hidEl   = document.getElementById('sr-f-idx');
    var sRampa  = document.getElementById('sr-f-rampa');
    var sPlaca  = document.getElementById('sr-f-placa');
    var sKm     = document.getElementById('sr-f-km');
    var sFecIng = document.getElementById('sr-f-fecha-ing');
    var sHorIng = document.getElementById('sr-f-hora-ing');
    var sFecSal = document.getElementById('sr-f-fecha-sal');
    var sHorSal = document.getElementById('sr-f-hora-sal');
    var sSit    = document.getElementById('sr-f-situacion');
    var sObs    = document.getElementById('sr-f-obs');

    var placa    = (sPlaca  ? sPlaca.value.trim().toUpperCase() : '');
    var rampaNum = (sRampa  ? parseInt(sRampa.value, 10) : 0);
    var eid      = (hidEl   ? parseInt(hidEl.value, 10) : NaN);

    if (!placa)    { alert('La placa es obligatoria.'); return; }
    if (!rampaNum) { alert('Selecciona una rampa.'); return; }

    var payload = {
        rampa:        rampaNum,
        placa:        placa,
        km:           sKm     ? (sKm.value     || '') : '',
        fecha_ingreso: sFecIng ? (sFecIng.value || null) : null,
        hora_ingreso:  sHorIng ? (sHorIng.value || null) : null,
        fecha_salida:  sFecSal ? (sFecSal.value || null) : null,
        hora_salida:   sHorSal ? (sHorSal.value || null) : null,
        situacion:    sSit    ? (sSit.value     || '') : '',
        obs:          sObs    ? (sObs.value     || '') : '',
        creado_por:   localStorage.getItem('fleet_user') || ''
    };

    var esEdicion = !isNaN(eid) && eid > 0;
    var url    = esEdicion ? '/api/taller-rampas/' + eid : '/api/taller-rampas';
    var method = esEdicion ? 'PUT' : 'POST';

    fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function(d) {
            if (!esEdicion && d.id) window.srDetalleId = d.id;
            if (sRampa) sRampa.disabled = false;
            srCerrarDrawers();
            srCargarEntradas(); // recarga desde BD
        })
        .catch(function(err) {
            console.error('Error guardando rampa:', err);
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar', 'danger');
        });
};

// ── Generar OT ───────────────────────────────────────────────────
window.srGenerarOT = function(id) {
    var e = window.srEntradas.find(function(x) { return x._id === id; });
    if (!e) return;

    var pDisp = document.getElementById('sr-ot-placa-disp'); if (pDisp) pDisp.textContent = e.placa;
    var rDisp = document.getElementById('sr-ot-rampa-disp'); if (rDisp) rDisp.textContent = 'Rampa ' + e.rampa;
    var pHid  = document.getElementById('sr-ot-placa-hid');  if (pHid)  pHid.value = e.placa;
    var rHid  = document.getElementById('sr-ot-rampa-hid');  if (rHid)  rHid.value = String(e.rampa);

    var hoy = new Date();
    var fechaHora = (e.fechaIngreso || hoy.toISOString().split('T')[0]) + ' ' + (e.horaIngreso || hoy.toTimeString().slice(0, 5));
    var fhEl = document.getElementById('sr-ot-fecha-ing'); if (fhEl) fhEl.value = fechaHora;
    var kmEl = document.getElementById('sr-ot-km');        if (kmEl) kmEl.value = e.km || '0';
    var moEl = document.getElementById('sr-ot-motivo');    if (moEl) moEl.value = e.obs || '';

    var tipoEl = document.getElementById('sr-ot-tipo');
    if (tipoEl) tipoEl.value = '';
    var subEl  = document.getElementById('sr-ot-subtipo');
    if (subEl)  { subEl.innerHTML = '<option value="">— Seleccionar tipo primero —</option>'; subEl.disabled = true; }

    srAbrirDrawer('sr-drawer-ot');
};

// ── Cascade Sub Tipo ─────────────────────────────────────────────
var SR_SUBTIPOS = {
    'Preventivo': ['Inspección Pre-PM','Campaña','Limpieza Integral','Rutina','Programado','Oportuno'],
    'Correctivo': ['Falla','Varado','Programado','Garantía','Accidentabilidad','Mala Operación'],
    'Predictivo': ['Por condición','Prueba'],
    'Proactivo':  ['Mejora'],
    'Servicio':   ['Stock','Taller']
};

window.srCambiarTipoOT = function() {
    var tipo = (document.getElementById('sr-ot-tipo') || {}).value || '';
    var sel  = document.getElementById('sr-ot-subtipo');
    if (!sel) return;
    var opts = SR_SUBTIPOS[tipo] || [];
    sel.innerHTML = '<option value="">— Seleccionar —</option>' + opts.map(function(s) {
        return '<option value="' + s + '">' + s + '</option>';
    }).join('');
    sel.disabled = !opts.length;
};

// ── Enviar OT ────────────────────────────────────────────────────
window.srEnviarOT = function() {
    var placa      = (document.getElementById('sr-ot-placa-hid') || {}).value || '';
    var rampa      = (document.getElementById('sr-ot-rampa-hid') || {}).value || '';
    var tipo       = (document.getElementById('sr-ot-tipo')       || {}).value || '';
    var subtipo    = (document.getElementById('sr-ot-subtipo')    || {}).value || '';
    var supervisor = (document.getElementById('sr-ot-supervisor') || {}).value || '';
    var motivo     = (document.getElementById('sr-ot-motivo')     || {}).value || '';
    var km         = (document.getElementById('sr-ot-km')         || {}).value || '0';
    var sitIni     = (document.getElementById('sr-ot-situacion')  || {}).value || '';

    if (!tipo)    { alert('Selecciona el tipo de OT.');     return; }
    if (!subtipo) { alert('Selecciona el sub tipo de OT.'); return; }
    if (!placa)   { alert('No se encontró la placa. Abre el detalle de la rampa y usa el botón "Generar OT".'); return; }

    fetch('/api/ordenes-trabajo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            placa:        placa,
            estado:       'Pendiente',
            detalles_json: JSON.stringify({
                tipo_ot:           tipo,
                sub_tipo:          subtipo,
                motivo:            motivo,
                rampa_origen:      rampa,
                supervisor:        supervisor,
                km:                km,
                situacion_inicial: sitIni
            })
        })
    })
    .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function(d) {
        srCerrarDrawers();
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT ' + (d.id_ot || '') + ' generada correctamente', 'success');
        srCargarOTs();
    })
    .catch(function(err) {
        console.error('Error generando OT:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al generar la OT', 'danger');
    });
};

// ── Detalle OT ───────────────────────────────────────────────────
window.srAbrirDetalleOT = function(idOt) {
    var ot = window.srOtData.find(function(o) { return (o.id_ot || o.ticket_entrada) === idOt; });
    if (!ot) return;
    var det = {};
    try { det = typeof ot.detalles_json === 'string' ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {}); } catch(ex) {}

    var scroll = document.getElementById('sr-ot-det-scroll');
    var footer = document.getElementById('sr-ot-det-footer');
    if (!scroll || !footer) return;

    // Helpers locales (no dependen del módulo Reportes OT)
    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function fld(lbl, val) {
        return '<div class="rot-field"><span class="rot-field-lbl">' + esc(lbl) + '</span><span class="rot-field-val">' + val + '</span></div>';
    }
    function badge(e) {
        var map = { 'Pendiente':['rot-b-pendiente','Pendiente'], 'Aprobada':['rot-b-aprobada','Aprobada'], 'Cerrada':['rot-b-cerrada','Cerrada'], 'Anulado':['rot-b-anulado','Anulado'] };
        var v = map[e] || ['rot-b-pendiente', e || '—'];
        return '<span class="rot-badge ' + v[0] + '">' + v[1] + '</span>';
    }
    function fmtF(iso) {
        if (!iso) return '—';
        var s = typeof iso === 'string' ? iso.split('T')[0] : String(iso);
        var p = s.split('-'); if (p.length !== 3) return iso;
        var m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        return p[2] + ' ' + m[parseInt(p[1],10)-1] + ' ' + p[0].slice(2);
    }
    function cap(str) { return str.replace(/_/g,' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); }); }

    var estado = ot.estado || 'Pendiente';
    var html = '';

    // ── ID Hero bar ──
    html += '<div class="rot-id-bar">';
    html += '<div><div class="rot-id-lbl">N° Orden de Trabajo</div><div class="rot-id-num">' + esc(idOt) + '</div></div>';
    html += '<div style="text-align:right;">' + badge(estado)
          + '<div style="font-size:0.72rem;color:var(--subtext);margin-top:4px;">' + fmtF(ot.fecha_ingreso) + '</div></div>';
    html += '</div>';

    // ── Datos Generales ──
    html += '<div class="rot-sec"><div class="rot-sec-hd">Datos Generales</div>';
    html += fld('Placa',      esc(ot.placa || '—'));
    html += fld('Tipo OT',    esc(det.tipo_ot || ot.tipo || '—'));
    html += fld('Sub Tipo',   esc(det.sub_tipo || '—'));
    html += fld('Supervisor', esc(det.supervisor || ot.supervisor || '—'));
    html += fld('Situación',  esc(det.situacion_inicial || ot.situacion || '—'));
    html += fld('Aprobación', badge(estado));
    html += fld('Costo Total','<span id="sr-ot-costo-total" style="font-weight:800;color:#16a34a;">S/' + parseFloat(ot.costo_total || 0).toFixed(2) + '</span>');
    html += '</div>';

    // ── Fechas y Tiempos ──
    html += '<div class="rot-sec"><div class="rot-sec-hd">Fechas y Tiempos</div>';
    html += fld('Fecha Creación', fmtF(ot.creado_en || ot.fecha_ingreso));
    if (det.km) html += fld('Kilometraje', esc(Number(det.km).toLocaleString('es-PE') + ' km'));
    html += '</div>';

    // ── Motivo / Observaciones ──
    if (det.motivo || ot.observaciones) {
        html += '<div class="rot-sec"><div class="rot-sec-hd">Motivo / Observaciones</div>';
        html += '<div style="padding:10px 12px;font-size:0.82rem;color:var(--text);">' + esc(det.motivo || ot.observaciones || '') + '</div>';
        html += '</div>';
    }

    // ── Datos Adicionales (campos extra del JSON no mapeados) ──
    var CAMPOS_STD = ['tipo_ot','sub_tipo','motivo','obs_cierre','km','situacion_inicial','supervisor','tecnico','rampa_origen','aprobacion'];
    var extras = Object.keys(det).filter(function(k) { return CAMPOS_STD.indexOf(k) === -1 && det[k]; });
    if (extras.length) {
        html += '<div class="rot-sec"><div class="rot-sec-hd">Datos Adicionales</div>';
        extras.forEach(function(k) { html += fld(cap(k), esc(String(det[k]))); });
        html += '</div>';
    }

    var esAprobada = (estado === 'Aprobada');

    // ── Trabajos (placeholder — se rellena con fetch) ──
    html += '<div class="rot-sec" id="sr-sec-trabajos">'
          + '<div class="rot-sec-hd">Trabajos <span id="sr-tr-count" style="background:rgba(88,101,242,0.12);color:var(--primary,#5865F2);border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:4px;">…</span></div>'
          + '<div id="sr-tr-body"><div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>'
          + '</div>';

    // ── Salidas de Almacén (placeholder — se rellena con fetch) ──
    html += '<div class="rot-sec" id="sr-sec-materiales">'
          + '<div class="rot-sec-hd">Salidas de Almacén <span id="sr-mat-count" style="background:rgba(88,101,242,0.12);color:var(--primary,#5865F2);border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:4px;">…</span></div>'
          + '<div id="sr-mat-body"><div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>'
          + '</div>';

    scroll.innerHTML = html;

    var titulo = document.getElementById('sr-ot-det-titulo'); if (titulo) titulo.textContent = idOt;
    var sub    = document.getElementById('sr-ot-det-placa');  if (sub)    sub.textContent    = ot.placa || '';

    var permisos = {};
    try { permisos = JSON.parse(localStorage.getItem('fleet_permisos') || '{}'); } catch(ex) {}
    var puedeAprobar = permisos.admin === true || !!(permisos.ot && permisos.ot.aprobar);

    var ftHtml = '<button class="btn btn-sm btn-outline-danger" onclick="window.srEliminarOT(\'' + esc(idOt) + '\')">'
               + '<i class="bi bi-trash me-1"></i>Eliminar</button>';
    if (puedeAprobar && estado !== 'Anulado' && estado !== 'Aprobada' && estado !== 'Cerrada') {
        ftHtml += '<div class="ms-auto d-flex gap-2">'
               + '<button class="btn btn-sm btn-outline-danger" onclick="window.srAnularOT(\'' + esc(idOt) + '\')">'
               + '<i class="bi bi-x-circle me-1"></i>Anular</button>'
               + '<button class="btn btn-sm btn-success" onclick="window.srAprobarOT(\'' + esc(idOt) + '\')">'
               + '<i class="bi bi-check2-circle me-1"></i>Aprobar OT</button>'
               + '<button class="btn btn-sm btn-outline-secondary" onclick="window.srPDFOT(\'' + esc(idOt) + '\')">'
               + '<i class="bi bi-filetype-pdf me-1"></i>PDF</button>'
               + '</div>';
    } else if (!puedeAprobar && estado !== 'Aprobada' && estado !== 'Anulado' && estado !== 'Cerrada') {
        ftHtml += '<span class="ms-auto" style="font-size:0.75rem;color:var(--subtext);align-self:center;">'
               + '<i class="bi bi-lock me-1"></i>Sin permiso para aprobar</span>';
    }
    footer.innerHTML = ftHtml;

    window.srOtActiva = idOt;
    srAbrirDrawer('sr-drawer-ot-det');

    // ── Fetch trabajos + materiales en paralelo ──
    window.srOtTrabajosActivos   = [];
    window.srOtMaterialesActivos = [];
    Promise.all([
        fetch('/api/ot-trabajos?id_ot='   + encodeURIComponent(idOt)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOt)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; })
    ]).then(function(res) {
        window.srOtTrabajosActivos   = Array.isArray(res[0]) ? res[0] : [];
        window.srOtMaterialesActivos = Array.isArray(res[1]) ? res[1] : [];
        srRenderSecTrabajos(idOt, esAprobada);
        srRenderSecMateriales(idOt, esAprobada);
        // Actualizar Costo Total dinámico (trabajos Aprobado + materiales Despachado)
        var costoTr = window.srOtTrabajosActivos
            .filter(function(t) { return t.estado === 'Aprobado'; })
            .reduce(function(s, t) {
                var d2 = {}; try { d2 = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); } catch(e) {}
                return s + parseFloat(d2.costo || 0);
            }, 0);
        var costoMat = window.srOtMaterialesActivos
            .filter(function(m) { return m.estado === 'Despachado'; })
            .reduce(function(s, m) { return s + parseFloat(m.costo_total || 0); }, 0);
        var elCosto = document.getElementById('sr-ot-costo-total');
        if (elCosto) elCosto.textContent = 'S/' + (costoTr + costoMat).toFixed(2);
    });
};

window.srAprobarOT = function(idOt) {
    if (!confirm('¿Aprobar la OT ' + idOt + '?')) return;
    fetch('/api/ordenes-trabajo/' + idOt, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ accion: 'aprobar' })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT aprobada', 'success');
        // Recargar OTs y reabrir el detalle con el estado actualizado
        fetch('/api/ordenes-trabajo')
            .then(function(r) { return r.ok ? r.json() : []; })
            .then(function(data) {
                window.srOtData = Array.isArray(data) ? data : [];
                srRenderTabla();
                window.srAbrirDetalleOT(idOt);
            }).catch(function() {});
    })
    .catch(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al aprobar', 'danger');
    });
};

window.srEliminarOT = function(idOt) {
    if (!confirm('¿Eliminar la OT ' + idOt + '? Esta acción no se puede deshacer.')) return;
    fetch('/api/ordenes-trabajo/' + idOt, { method: 'DELETE' })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        srCerrarDrawers();
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT eliminada', 'success');
        srCargarOTs();
    })
    .catch(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar', 'danger');
    });
};

window.srAnularOT = function(idOt) {
    if (!confirm('¿Anular la OT ' + idOt + '? Esta acción no se puede deshacer.')) return;
    fetch('/api/ordenes-trabajo/' + idOt, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'anular' })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT anulada', 'success');
        fetch('/api/ordenes-trabajo')
            .then(function(r) { return r.ok ? r.json() : []; })
            .then(function(data) {
                window.srOtData = Array.isArray(data) ? data : [];
                srRenderTabla();
                window.srAbrirDetalleOT(idOt);
            }).catch(function() {});
    })
    .catch(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al anular', 'danger');
    });
};

window.srAgregarTrabajo = function(idOt) {
    var lbl = document.getElementById('sr-tr-ot-lbl'); if (lbl) lbl.textContent = idOt;
    var hid = document.getElementById('sr-tr-ot-id');  if (hid) hid.value = idOt;
    var desc  = document.getElementById('sr-tr-desc');    if (desc)  desc.value  = '';
    var pers  = document.getElementById('sr-tr-personal'); if (pers) pers.value  = '';
    var costo = document.getElementById('sr-tr-costo');   if (costo) costo.value = '0';
    var hoy = new Date();
    var localDT = hoy.getFullYear() + '-' +
        String(hoy.getMonth()+1).padStart(2,'0') + '-' +
        String(hoy.getDate()).padStart(2,'0') + 'T' +
        String(hoy.getHours()).padStart(2,'0') + ':' +
        String(hoy.getMinutes()).padStart(2,'0');
    var fi = document.getElementById('sr-tr-fecha-ini'); if (fi) fi.value = localDT;
    var ff = document.getElementById('sr-tr-fecha-fin'); if (ff) ff.value = '';
    srAbrirDrawer('sr-drawer-trabajo');
};

window.srGuardarTrabajo = function() {
    var idOt  = (document.getElementById('sr-tr-ot-id')       || {}).value || '';
    var desc  = ((document.getElementById('sr-tr-desc')        || {}).value || '').trim();
    var pers  = ((document.getElementById('sr-tr-personal')    || {}).value || '').trim();
    var fIni  = ((document.getElementById('sr-tr-fecha-ini')   || {}).value || '');
    var fFin  = ((document.getElementById('sr-tr-fecha-fin')   || {}).value || '');
    var costo = parseFloat((document.getElementById('sr-tr-costo') || {}).value || 0);
    if (!desc) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La descripción es requerida', 'danger'); return; }

    var user = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
    fetch('/api/ot-trabajos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id_ot: idOt,
            trabajo_realizado: desc,
            fecha_trabajo:  fIni || null,
            fecha_salida:   fFin || null,
            creado_por:     user,
            detalles_json:  JSON.stringify({ personal: pers, costo: costo })
        })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(d) {
        window.srCerrarSubDrawer('sr-drawer-trabajo');
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Trabajo ' + (d.ticket_visita || '') + ' registrado', 'success');
        // Refrescar secciones del drawer OT
        fetch('/api/ot-trabajos?id_ot=' + encodeURIComponent(idOt))
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(rows) {
                window.srOtTrabajosActivos = Array.isArray(rows) ? rows : [];
                var ot = window.srOtData.find(function(o){ return (o.id_ot || o.ticket_entrada) === idOt; });
                srRenderSecTrabajos(idOt, ot ? ot.estado === 'Aprobada' : false);
            }).catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar trabajo', 'danger'); });
};

window.srAgregarSalida = function(idOt) {
    var lbl = document.getElementById('sr-mat-ot-lbl'); if (lbl) lbl.textContent = idOt;
    var hid = document.getElementById('sr-mat-ot-id');  if (hid) hid.value = idOt;
    ['sr-mat-producto','sr-mat-solicitante','sr-mat-obs'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
    });
    var cant = document.getElementById('sr-mat-cant');       if (cant) cant.value = '1';
    var cu   = document.getElementById('sr-mat-costo-unit'); if (cu)   cu.value   = '0';
    var ct   = document.getElementById('sr-mat-costo-total');if (ct)   ct.value   = '0';
    var um   = document.getElementById('sr-mat-um');         if (um)   um.value   = 'Pza';
    srAbrirDrawer('sr-drawer-material');
};

window.srCalcTotal = function() {
    var cant = parseFloat((document.getElementById('sr-mat-cant')       || {}).value || 0);
    var cu   = parseFloat((document.getElementById('sr-mat-costo-unit') || {}).value || 0);
    var ct   = document.getElementById('sr-mat-costo-total');
    if (ct) ct.value = (cant * cu).toFixed(2);
};

window.srGuardarMaterial = function() {
    var idOt     = ((document.getElementById('sr-mat-ot-id')         || {}).value || '');
    var prod     = ((document.getElementById('sr-mat-producto')       || {}).value || '').trim();
    var cant     = parseFloat((document.getElementById('sr-mat-cant') || {}).value || 1);
    var um       = ((document.getElementById('sr-mat-um')             || {}).value || 'Pza');
    var cu       = parseFloat((document.getElementById('sr-mat-costo-unit')  || {}).value || 0);
    var ct       = parseFloat((document.getElementById('sr-mat-costo-total') || {}).value || 0);
    var solic    = ((document.getElementById('sr-mat-solicitante')    || {}).value || '').trim();
    var obs      = ((document.getElementById('sr-mat-obs')            || {}).value || '').trim();

    if (!prod) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('El producto es requerido', 'danger'); return; }

    var user = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
    fetch('/api/ot-materiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ticket_ot: idOt, producto: prod, cantidad: cant,
            unidad_medida: um, costo_unit: cu, costo_total: ct,
            personal_solicitante: solic, observacion: obs,
            estado: 'Pendiente', creado_por: user
        })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(d) {
        window.srCerrarSubDrawer('sr-drawer-material');
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Solicitud ' + (d.id_solicitud || '') + ' registrada', 'success');
        fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOt))
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(rows) {
                window.srOtMaterialesActivos = Array.isArray(rows) ? rows : [];
                var ot = window.srOtData.find(function(o){ return (o.id_ot || o.ticket_entrada) === idOt; });
                srRenderSecMateriales(idOt, ot ? ot.estado === 'Aprobada' : false);
            }).catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar solicitud', 'danger'); });
};

window.srEliminarMaterial = function(idSolicitud, idOt) {
    if (!confirm('¿Eliminar esta solicitud de material?')) return;
    fetch('/api/ot-materiales/' + idSolicitud, { method: 'DELETE' })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Solicitud eliminada', 'success');
        fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOt))
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(rows) {
                window.srOtMaterialesActivos = Array.isArray(rows) ? rows : [];
                var ot = window.srOtData.find(function(o){ return (o.id_ot || o.ticket_entrada) === idOt; });
                srRenderSecMateriales(idOt, ot ? ot.estado === 'Aprobada' : false);
            }).catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar', 'danger'); });
};

window.srPDFOT = function(idOt) {
    var ot = window.srOtData.find(function(o) { return (o.id_ot || o.ticket_entrada) === idOt; });
    if (!ot) return;
    if (typeof window.generarPDF_OT === 'function') {
        window.generarPDF_OT(ot, window.srOtTrabajosActivos, window.srOtMaterialesActivos);
    } else {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Librería PDF no cargada. Recarga la página.', 'warning');
    }
};

// ── Render dinámico: sección Trabajos en el drawer OT ────────────
function srRenderSecTrabajos(idOt, esAprobada) {
    var body  = document.getElementById('sr-tr-body');
    var count = document.getElementById('sr-tr-count');
    if (!body) return;
    var lista = window.srOtTrabajosActivos;
    if (count) count.textContent = lista.length;

    var costoTotal = lista
        .filter(function(t) { return t.estado === 'Aprobado'; })
        .reduce(function(s, t) {
            var d2 = {}; try { d2 = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); } catch(e) {}
            return s + parseFloat(d2.costo || 0);
        }, 0);

    var html = '';
    if (esAprobada) {
        html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);">'
              + '<button class="btn btn-sm btn-outline-primary" onclick="window.srAgregarTrabajo(\'' + idOt + '\')">'
              + '<i class="bi bi-plus-lg me-1"></i>Agregar Trabajo</button></div>';
    }
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
            html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.81rem;">'
                  + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">'
                  + '<div><span style="font-weight:700;color:var(--primary,#5865F2);font-size:0.72rem;">' + (t.ticket_visita || '') + '</span> '
                  + bdg + '</div>'
                  + (det2.costo ? '<span style="font-weight:700;color:#16a34a;font-size:0.78rem;">S/' + parseFloat(det2.costo).toFixed(2) + '</span>' : '')
                  + '</div>'
                  + '<div style="color:var(--text);margin-top:3px;">' + (t.trabajo_realizado || '—') + '</div>'
                  + (det2.personal ? '<div style="font-size:0.75rem;color:var(--subtext);margin-top:2px;"><i class="bi bi-person me-1"></i>' + det2.personal + '</div>' : '')
                  + ((fecIni || fecFin) ? '<div style="font-size:0.75rem;color:var(--subtext);margin-top:1px;"><i class="bi bi-calendar me-1"></i>'
                      + (fecIni || '') + (fecFin ? ' → ' + fecFin : '') + '</div>' : '')
                  + '</div>';
        });
        if (costoTotal > 0) {
            html += '<div style="padding:8px 12px;font-size:0.82rem;font-weight:700;text-align:right;color:#16a34a;">'
                  + 'Total aprobado: S/' + costoTotal.toFixed(2) + '</div>';
        }
    }
    body.innerHTML = html;
}

// ── Render dinámico: sección Materiales en el drawer OT ──────────
function srRenderSecMateriales(idOt, esAprobada) {
    var body  = document.getElementById('sr-mat-body');
    var count = document.getElementById('sr-mat-count');
    if (!body) return;
    var lista = window.srOtMaterialesActivos;
    if (count) count.textContent = lista.length;

    var costoTotal = lista
        .filter(function(m) { return m.estado === 'Despachado'; })
        .reduce(function(s, m) { return s + parseFloat(m.costo_total || 0); }, 0);
    var hayPendientes = lista.some(function(m) { return m.estado !== 'Despachado'; });

    var html = '';
    if (esAprobada) {
        html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);">'
              + '<button class="btn btn-sm btn-outline-secondary" onclick="window.srAgregarSalida(\'' + idOt + '\')">'
              + '<i class="bi bi-plus-lg me-1"></i>Agregar Salida</button></div>';
    }
    if (!lista.length) {
        html += '<div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;">No hay salidas registradas</div>';
    } else {
        lista.forEach(function(m) {
            var badge = m.estado === 'Despachado'
                ? '<span style="background:rgba(22,163,74,0.12);color:#16a34a;border-radius:12px;padding:2px 8px;font-size:0.68rem;font-weight:700;">Despachado</span>'
                : '<span style="background:rgba(217,119,6,0.12);color:#d97706;border-radius:12px;padding:2px 8px;font-size:0.68rem;font-weight:700;">Pendiente</span>';
            html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.81rem;">'
                  + '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">'
                  + '<div><span style="font-weight:700;color:var(--text);">' + (m.producto || '—') + '</span> ' + badge + '</div>'
                  + '<button class="btn btn-sm" style="color:var(--subtext);padding:0 4px;" onclick="window.srEliminarMaterial(' + m.id + ',\'' + idOt + '\')" title="Eliminar"><i class="bi bi-trash" style="font-size:0.75rem;"></i></button>'
                  + '</div>'
                  + '<div style="color:var(--subtext);margin-top:2px;">'
                  + (m.cantidad || '') + ' ' + (m.unidad_medida || '') + ' · S/' + parseFloat(m.costo_unit || 0).toFixed(2) + ' c/u'
                  + ' = <strong style="color:var(--text);">S/' + parseFloat(m.costo_total || 0).toFixed(2) + '</strong>'
                  + '</div>'
                  + '</div>';
        });
        html += '<div style="padding:8px 12px;font-size:0.82rem;font-weight:700;text-align:right;color:#16a34a;">'
              + 'Total despachado: S/' + costoTotal.toFixed(2)
              + (hayPendientes ? '<span style="font-size:0.72rem;color:#d97706;margin-left:6px;">(pendientes no incluidos)</span>' : '')
              + '</div>';
    }
    body.innerHTML = html;
}

// ── Helpers UI ───────────────────────────────────────────────────
function srBadgeSituacion(sit, ocupada) {
    if (!ocupada || !sit) return '<span class="sr-semaforo sr-sem-vacio"><span class="sr-sem-dot"></span>Libre</span>';
    if (sit === 'En espera')  return '<span class="sr-sit sr-sit-espera">'  + sit + '</span>';
    if (sit === 'En proceso') return '<span class="sr-sit sr-sit-proceso">' + sit + '</span>';
    if (sit === 'Listo')      return '<span class="sr-sit sr-sit-listo">'   + sit + '</span>';
    return '<span class="sr-sit sr-sit-proceso">' + sit + '</span>';
}

function srSemaforo(sit, ocupada) {
    if (!ocupada || !sit) return '<span class="sr-semaforo sr-sem-vacio"><span class="sr-sem-dot"></span>Libre</span>';
    var cls = 'sr-sem-proceso';
    if (sit === 'En espera') cls = 'sr-sem-espera';
    if (sit === 'Listo')     cls = 'sr-sem-listo';
    return '<span class="sr-semaforo ' + cls + '"><span class="sr-sem-dot"></span>' + sit + '</span>';
}

function srBadgeEstado(estado) {
    var map = {
        'Pendiente':  'rgba(217,119,6,0.12);color:#d97706',
        'Aprobada':   'rgba(22,163,74,0.12);color:#16a34a',
        'Cerrada':    'rgba(100,116,139,0.12);color:#64748b',
        'Anulado':    'rgba(220,38,38,0.1);color:#dc2626',
        'Finalizado': 'rgba(22,163,74,0.12);color:#16a34a'
    };
    var s = map[estado] || 'rgba(148,163,184,0.12);color:#94a3b8';
    return '<span style="display:inline-block;padding:2px 9px;border-radius:12px;font-size:0.72rem;font-weight:700;background:' + s.split(';')[0] + ';' + s.split(';')[1] + '">' + estado + '</span>';
}

function srField(lbl, val) {
    return '<div class="sr-field"><span class="sr-field-lbl">' + lbl + '</span><span class="sr-field-val">' + val + '</span></div>';
}

function srFmtFecha(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    if (p.length !== 3) return iso;
    var m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return p[2] + ' ' + m[parseInt(p[1],10)-1] + ' ' + p[0].slice(2);
}

function srAbrirDrawer(id) {
    var back = document.getElementById('srDrawerBackdrop');
    if (back) back.classList.add('open');
    var d = document.getElementById(id);
    if (d) d.classList.add('open');
}

window.srCerrarDrawers = function() {
    var back = document.getElementById('srDrawerBackdrop');
    if (back) back.classList.remove('open');
    ['sr-drawer-registro','sr-drawer-ot','sr-drawer-ot-det','sr-drawer-trabajo','sr-drawer-material'].forEach(function(id) {
        var d = document.getElementById(id);
        if (d) d.classList.remove('open');
    });
    var sR = document.getElementById('sr-f-rampa');
    if (sR) sR.disabled = false;
};

// Cierra solo un sub-drawer sin afectar el backdrop ni los demás
window.srCerrarSubDrawer = function(drawerId) {
    var d = document.getElementById(drawerId);
    if (d) d.classList.remove('open');
    // Apagar backdrop solo si ningún otro drawer está abierto
    var abiertos = ['sr-drawer-registro','sr-drawer-ot','sr-drawer-ot-det','sr-drawer-trabajo','sr-drawer-material'].filter(function(id) {
        var el = document.getElementById(id);
        return el && el.classList.contains('open');
    });
    if (!abiertos.length) {
        var back = document.getElementById('srDrawerBackdrop');
        if (back) back.classList.remove('open');
    }
};

function srLimpiarFormRegistro() {
    ['sr-f-idx','sr-f-placa','sr-f-km','sr-f-fecha-ing','sr-f-hora-ing',
     'sr-f-fecha-sal','sr-f-hora-sal','sr-f-obs'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
    });
    var sSit = document.getElementById('sr-f-situacion');
    if (sSit) sSit.value = sSit.options[0] ? sSit.options[0].value : '';
    var sR = document.getElementById('sr-f-rampa');
    if (sR) { sR.value = ''; sR.disabled = false; }
}
