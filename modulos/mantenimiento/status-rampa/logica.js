// ================================================================
// Módulo Status Rampa — Azkell Fleet
// Patrón SPA: window.* globals, init_status_rampa() entry point
// Rampas 1-12 son posiciones físicas fijas; datos en window.srData
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.srData          = window.srData          || _srInicializarRampas();
window.srOtData        = window.srOtData        || [];
window.srDetalleIdx    = window.srDetalleIdx    || null;  // índice de rampa activa en panel (0-11)
window.srDatosFiltrados = window.srDatosFiltrados || null; // null = sin filtro activo

// ── Colores únicos por rampa (pasteles) ─────────────────────────
var SR_COLORES = [
    '#6366f1', // 1 – índigo
    '#0ea5e9', // 2 – sky
    '#10b981', // 3 – emerald
    '#f59e0b', // 4 – amber
    '#ef4444', // 5 – red
    '#8b5cf6', // 6 – violet
    '#14b8a6', // 7 – teal
    '#f97316', // 8 – orange
    '#ec4899', // 9 – pink
    '#84cc16', // 10 – lime
    '#06b6d4', // 11 – cyan
    '#a855f7'  // 12 – purple
];

// ── Inicializador de las 12 rampas vacías ────────────────────────
function _srInicializarRampas() {
    var arr = [];
    for (var i = 1; i <= 12; i++) {
        arr.push({
            rampa: i,
            placa: '',
            km: '',
            fechaIngreso: '',
            horaIngreso: '',
            fechaSalida: '',
            horaSalida: '',
            situacion: '',   // 'En espera' | 'En proceso' | 'Listo' | ''
            obs: '',
            ocupada: false
        });
    }
    return arr;
}

// ── Entry point ──────────────────────────────────────────────────
window.init_status_rampa = function() {
    // Cargar OTs relacionadas del backend
    srCargarOTs();
};

// ── Carga OTs desde API ──────────────────────────────────────────
function srCargarOTs() {
    fetch('/api/ordenes-trabajo')
        .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function(data) {
            window.srOtData = Array.isArray(data) ? data : [];
            srRenderTabla();
        })
        .catch(function(err) {
            console.error('Status Rampa: error cargando OTs:', err);
            window.srOtData = [];
            srRenderTabla();
        });
}

// ── Render principal de la tabla ─────────────────────────────────
function srRenderTabla() {
    var tbody = document.getElementById('sr-tbody');
    if (!tbody) return;

    var busq = (document.getElementById('sr-buscador') || {}).value || '';
    busq = busq.trim().toLowerCase();

    var filas = [];
    for (var i = 0; i < window.srData.length; i++) {
        var r = window.srData[i];
        if (busq) {
            var hayMatch =
                String(r.rampa).indexOf(busq) !== -1 ||
                (r.placa || '').toLowerCase().indexOf(busq) !== -1 ||
                (r.situacion || '').toLowerCase().indexOf(busq) !== -1;
            if (!hayMatch) continue;
        }
        filas.push({ idx: i, r: r });
    }

    var html = '';
    for (var f = 0; f < filas.length; f++) {
        var idx = filas[f].idx;
        var r   = filas[f].r;
        var esActiva = (window.srDetalleIdx === idx);

        // OTs relacionadas para esta placa
        var otsPlaca = r.ocupada && r.placa
            ? window.srOtData.filter(function(o){ return (o.placa || '').toUpperCase() === r.placa.toUpperCase(); })
            : [];
        var otsTxt = otsPlaca.length
            ? otsPlaca.slice(0,3).map(function(o){ return '<span class="badge" style="background:rgba(88,101,242,0.1);color:var(--primary,#5865F2);font-weight:700;font-size:0.68rem;margin-right:3px;">' + (o.ticket_entrada || o.id_ot || '—') + '</span>'; }).join('') + (otsPlaca.length > 3 ? '<span style="font-size:0.72rem;color:var(--subtext)">+' + (otsPlaca.length - 3) + '</span>' : '')
            : (r.ocupada ? '<span style="color:var(--subtext);font-size:0.8rem;">—</span>' : '');

        var claseFila = r.ocupada ? ('sr-ocupada' + (esActiva ? ' sr-activa' : '')) : 'sr-row-vacia';
        var clickFila = r.ocupada ? ('onclick="window.srAbrirDetalle(' + idx + ')"') : '';

        html += '<tr class="' + claseFila + '" ' + clickFila + '>';
        // Rampa badge
        html += '<td><span class="sr-badge-rampa" style="background:' + SR_COLORES[idx] + '">' + r.rampa + '</span></td>';
        // Fecha ingreso
        html += '<td>' + (r.fechaIngreso ? srFmtFecha(r.fechaIngreso) : (r.ocupada ? '—' : '<span style="color:var(--subtext);font-style:italic;font-size:0.8rem;">Vacía</span>')) + '</td>';
        // Hora ingreso
        html += '<td>' + (r.horaIngreso || (r.ocupada ? '—' : '')) + '</td>';
        // Placa
        html += '<td style="font-weight:700;">' + (r.placa || '') + '</td>';
        // Situación
        html += '<td>' + srBadgeSituacion(r.situacion, r.ocupada) + '</td>';
        // Semáforo
        html += '<td>' + srSemaforo(r.situacion, r.ocupada) + '</td>';
        // Fecha salida
        html += '<td>' + (r.fechaSalida ? srFmtFecha(r.fechaSalida) : '') + '</td>';
        // Hora salida
        html += '<td>' + (r.horaSalida || '') + '</td>';
        // OTs relacionadas
        html += '<td>' + otsTxt + '</td>';
        // Acciones
        html += '<td>';
        if (r.ocupada) {
            html += '<button class="btn btn-sm btn-outline-secondary" style="font-size:0.72rem;padding:2px 8px;" onclick="event.stopPropagation();window.srEditarRampa(' + idx + ')" title="Editar"><i class="bi bi-pencil"></i></button> ';
            html += '<button class="btn btn-sm btn-outline-danger" style="font-size:0.72rem;padding:2px 8px;" onclick="event.stopPropagation();window.srLiberarRampa(' + idx + ')" title="Liberar rampa"><i class="bi bi-box-arrow-right"></i></button>';
        } else {
            html += '<button class="btn-sr-reg" onclick="event.stopPropagation();window.srRegistrar(' + idx + ')"><i class="bi bi-plus-lg me-1"></i>Ingresar</button>';
        }
        html += '</td>';
        html += '</tr>';
    }

    if (!html) {
        html = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--subtext);font-size:0.85rem;">No hay resultados para esta búsqueda.</td></tr>';
    }

    tbody.innerHTML = html;
}

// ── Buscador ─────────────────────────────────────────────────────
window.srBuscar = function() {
    srRenderTabla();
    // Cerrar panel si la rampa activa ya no está visible
    if (window.srDetalleIdx !== null) {
        var tr = document.querySelector('#sr-tbody tr.sr-activa');
        if (!tr) window.srCerrarDetalle();
    }
};

// ── Abrir panel de detalle ────────────────────────────────────────
window.srAbrirDetalle = function(idx) {
    var r = window.srData[idx];
    if (!r || !r.ocupada) return;

    window.srDetalleIdx = idx;
    srRenderTabla(); // re-renderizar para marcar fila activa

    var panel = document.getElementById('sr-panel-detalle');
    var scroll = document.getElementById('sr-detalle-scroll');
    var footer = document.getElementById('sr-detalle-footer');
    if (!panel || !scroll || !footer) return;

    panel.classList.add('open');

    // OTs relacionadas
    var otsPlaca = window.srOtData.filter(function(o){ return (o.placa || '').toUpperCase() === r.placa.toUpperCase(); });
    // Backlog relacionado (OTs sin cerrar)
    var backlog = otsPlaca.filter(function(o){ return o.aprobacion !== 'Cerrada' && o.aprobacion !== 'Anulado'; });

    var html = '';
    // Hero con badge de rampa y placa
    html += '<div class="sr-hero">';
    html += '  <div class="sr-hero-badge" style="background:' + SR_COLORES[idx] + '">' + r.rampa + '</div>';
    html += '  <div>';
    html += '    <div class="sr-hero-placa">' + r.placa + '</div>';
    html += '    <div class="sr-hero-sub">' + srSemaforo(r.situacion, true) + '</div>';
    html += '  </div>';
    html += '</div>';

    // Datos de ingreso
    html += '<div class="sr-sec">';
    html += '  <div class="sr-sec-hd">Datos de Ingreso</div>';
    html += srField('Rampa', 'N° ' + r.rampa);
    html += srField('Placa', r.placa || '—');
    html += srField('Kilometraje', r.km ? Number(r.km).toLocaleString('es-PE') + ' km' : '—');
    html += srField('Fecha Ingreso', r.fechaIngreso ? srFmtFecha(r.fechaIngreso) : '—');
    html += srField('Hora Ingreso', r.horaIngreso || '—');
    html += srField('Situación', r.situacion || '—');
    if (r.obs) html += srField('Observaciones', r.obs);
    html += '</div>';

    // OTs relacionadas
    html += '<div class="sr-sec" style="margin-top:1rem">';
    html += '  <div class="sr-sec-hd">OTs Relacionadas <span style="background:rgba(88,101,242,0.12);color:var(--primary,#5865F2);border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:6px;">' + otsPlaca.length + '</span></div>';
    if (otsPlaca.length === 0) {
        html += '<div class="sr-empty">Sin OTs registradas para esta placa.</div>';
    } else {
        html += '<table class="sr-mini-table"><thead><tr><th>N° OT</th><th>Tipo</th><th>Situación</th><th>Estado</th></tr></thead><tbody>';
        for (var i = 0; i < otsPlaca.length; i++) {
            var ot = otsPlaca[i];
            var det = {};
            try { det = typeof ot.detalles_json === 'string' ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {}); } catch(e) {}
            html += '<tr>';
            html += '<td style="font-weight:700;color:var(--primary,#5865F2);">' + (ot.ticket_entrada || ot.id_ot || '—') + '</td>';
            html += '<td>' + (det.tipo_ot || ot.tipo || '—') + '</td>';
            html += '<td>' + (ot.situacion || '—') + '</td>';
            html += '<td>' + (ot.aprobacion || '—') + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
    }
    html += '</div>';

    // Backlog pendiente
    if (backlog.length > 0) {
        html += '<div class="sr-sec" style="margin-top:1rem">';
        html += '  <div class="sr-sec-hd" style="color:#d97706;">Backlog Pendiente <span style="background:rgba(217,119,6,0.12);color:#d97706;border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:6px;">' + backlog.length + '</span></div>';
        html += '<table class="sr-mini-table"><thead><tr><th>N° OT</th><th>Tipo</th><th>Estado Aprobación</th></tr></thead><tbody>';
        for (var j = 0; j < backlog.length; j++) {
            var bk = backlog[j];
            var bkDet = {};
            try { bkDet = typeof bk.detalles_json === 'string' ? JSON.parse(bk.detalles_json) : (bk.detalles_json || {}); } catch(e) {}
            html += '<tr>';
            html += '<td style="font-weight:700;">' + (bk.ticket_entrada || bk.id_ot || '—') + '</td>';
            html += '<td>' + (bkDet.tipo_ot || bk.tipo || '—') + '</td>';
            html += '<td><span style="color:#d97706;font-weight:700;font-size:0.78rem;">' + (bk.aprobacion || 'Pendiente') + '</span></td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
        html += '</div>';
    }

    scroll.innerHTML = html;

    // Footer del panel
    footer.innerHTML =
        '<button class="btn btn-sm btn-outline-secondary" onclick="window.srEditarRampa(' + idx + ')">' +
        '  <i class="bi bi-pencil me-1"></i>Editar' +
        '</button>' +
        '<button class="btn btn-sm btn-success" onclick="window.srGenerarOT(' + idx + ')">' +
        '  <i class="bi bi-file-earmark-plus me-1"></i>Generar OT' +
        '</button>' +
        '<button class="btn btn-sm btn-outline-danger ms-auto" onclick="window.srLiberarRampa(' + idx + ')">' +
        '  <i class="bi bi-box-arrow-right me-1"></i>Liberar' +
        '</button>';
    footer.style.display = 'flex';
};

// ── Cerrar panel detalle ──────────────────────────────────────────
window.srCerrarDetalle = function() {
    var panel = document.getElementById('sr-panel-detalle');
    if (panel) panel.classList.remove('open');
    window.srDetalleIdx = null;
    srRenderTabla();
};

// ── Registrar (abrir drawer) ──────────────────────────────────────
// idx: opcional. Si se pasa, pre-selecciona esa rampa
window.srRegistrar = function(idx) {
    srLimpiarFormRegistro();
    var titulo = document.getElementById('sr-drawer-titulo');
    if (titulo) titulo.textContent = 'Registrar Unidad en Rampa';

    var hid = document.getElementById('sr-f-idx');
    if (hid) hid.value = '';

    if (typeof idx !== 'undefined') {
        var selRampa = document.getElementById('sr-f-rampa');
        if (selRampa) selRampa.value = String(idx + 1);
    }

    // Pre-llenar fecha y hora actuales
    var hoy = new Date();
    var fecIng = document.getElementById('sr-f-fecha-ing');
    if (fecIng) fecIng.value = hoy.toISOString().split('T')[0];
    var horIng = document.getElementById('sr-f-hora-ing');
    if (horIng) horIng.value = hoy.toTimeString().slice(0,5);

    srAbrirDrawer('sr-drawer-registro');
};

// ── Editar rampa existente ────────────────────────────────────────
window.srEditarRampa = function(idx) {
    var r = window.srData[idx];
    if (!r) return;

    srLimpiarFormRegistro();
    var titulo = document.getElementById('sr-drawer-titulo');
    if (titulo) titulo.textContent = 'Editar Rampa ' + r.rampa;

    var hid = document.getElementById('sr-f-idx');
    if (hid) hid.value = String(idx);

    var s = document.getElementById('sr-f-rampa');
    if (s) { s.value = String(r.rampa); s.disabled = true; }

    var ep = document.getElementById('sr-f-placa');
    if (ep) ep.value = r.placa || '';
    var ek = document.getElementById('sr-f-km');
    if (ek) ek.value = r.km || '';
    var efi = document.getElementById('sr-f-fecha-ing');
    if (efi) efi.value = r.fechaIngreso || '';
    var ehi = document.getElementById('sr-f-hora-ing');
    if (ehi) ehi.value = r.horaIngreso || '';
    var esi = document.getElementById('sr-f-situacion');
    if (esi) esi.value = r.situacion || 'En espera';
    var eo = document.getElementById('sr-f-obs');
    if (eo) eo.value = r.obs || '';

    srAbrirDrawer('sr-drawer-registro');
};

// ── Liberar rampa ─────────────────────────────────────────────────
window.srLiberarRampa = function(idx) {
    var r = window.srData[idx];
    if (!r) return;
    if (!confirm('¿Confirmar la salida de ' + r.placa + ' de la Rampa ' + r.rampa + '?')) return;

    var hoy = new Date();
    r.fechaSalida = hoy.toISOString().split('T')[0];
    r.horaSalida  = hoy.toTimeString().slice(0,5);
    r.ocupada     = false;
    r.situacion   = '';

    if (window.srDetalleIdx === idx) window.srCerrarDetalle();
    srRenderTabla();
};

// ── Guardar registro (nuevo o edición) ───────────────────────────
window.srGuardarRegistro = function() {
    var hidEl  = document.getElementById('sr-f-idx');
    var sRampa = document.getElementById('sr-f-rampa');
    var sPlaca = document.getElementById('sr-f-placa');
    var sKm    = document.getElementById('sr-f-km');
    var sFecIng= document.getElementById('sr-f-fecha-ing');
    var sHorIng= document.getElementById('sr-f-hora-ing');
    var sSit   = document.getElementById('sr-f-situacion');
    var sObs   = document.getElementById('sr-f-obs');

    var placa = (sPlaca ? sPlaca.value.trim().toUpperCase() : '');
    var rampaNum = sRampa ? parseInt(sRampa.value, 10) : 0;

    if (!placa)    { alert('La placa es obligatoria.'); return; }
    if (!rampaNum) { alert('Selecciona una rampa.'); return; }

    var idx = rampaNum - 1;
    var hid = hidEl ? hidEl.value : '';

    // Si es nuevo registro verificar que la rampa esté libre
    if (hid === '' && window.srData[idx].ocupada) {
        if (!confirm('La Rampa ' + rampaNum + ' ya está ocupada por ' + window.srData[idx].placa + '.\n¿Sobreescribir?')) return;
    }

    var r = window.srData[idx];
    r.placa        = placa;
    r.km           = sKm ? (sKm.value || '') : '';
    r.fechaIngreso = sFecIng ? (sFecIng.value || '') : '';
    r.horaIngreso  = sHorIng ? (sHorIng.value || '') : '';
    r.situacion    = sSit ? (sSit.value || 'En espera') : 'En espera';
    r.obs          = sObs ? (sObs.value || '') : '';
    r.ocupada      = true;

    // Si fue una edición, limpiar fecha de salida
    if (hid !== '') {
        r.fechaSalida = '';
        r.horaSalida  = '';
    }

    // Re-habilitar select rampa por si fue deshabilitado en edición
    if (sRampa) sRampa.disabled = false;

    srCerrarDrawers();
    srRenderTabla();

    // Reabrir detalle si estaba abierto
    if (window.srDetalleIdx === idx) window.srAbrirDetalle(idx);
};

// ── Generar OT desde panel ────────────────────────────────────────
window.srGenerarOT = function(idx) {
    var r = window.srData[idx];
    if (!r || !r.ocupada) return;

    var pDisp = document.getElementById('sr-ot-placa-disp');
    var rDisp = document.getElementById('sr-ot-rampa-disp');
    var pHid  = document.getElementById('sr-ot-placa-hid');
    var rHid  = document.getElementById('sr-ot-rampa-hid');
    if (pDisp) pDisp.textContent = r.placa;
    if (rDisp) rDisp.textContent = 'Rampa ' + r.rampa;
    if (pHid)  pHid.value = r.placa;
    if (rHid)  rHid.value = String(r.rampa);

    // Limpiar formulario
    ['sr-ot-tipo','sr-ot-subtipo','sr-ot-supervisor','sr-ot-motivo'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });

    srAbrirDrawer('sr-drawer-ot');
};

// ── Enviar OT al backend ─────────────────────────────────────────
window.srEnviarOT = function() {
    var placa     = (document.getElementById('sr-ot-placa-hid') || {}).value || '';
    var rampa     = (document.getElementById('sr-ot-rampa-hid') || {}).value || '';
    var tipo      = (document.getElementById('sr-ot-tipo') || {}).value || '';
    var subtipo   = (document.getElementById('sr-ot-subtipo') || {}).value || '';
    var supervisor= (document.getElementById('sr-ot-supervisor') || {}).value || '';
    var motivo    = (document.getElementById('sr-ot-motivo') || {}).value || '';

    if (!tipo)   { alert('Selecciona el tipo de OT.'); return; }
    if (!subtipo){ alert('Selecciona el sub tipo.'); return; }

    var hoy = new Date();
    var payload = {
        placa: placa,
        supervisor: supervisor,
        situacion: 'En atención',
        aprobacion: 'Pendiente',
        detalles_json: JSON.stringify({
            tipo_ot: tipo,
            sub_tipo: subtipo,
            motivo: motivo,
            rampa_origen: rampa
        }),
        creado_en: hoy.toISOString()
    };

    fetch('/api/ordenes-trabajo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    })
    .then(function() {
        srCerrarDrawers();
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT generada correctamente', 'success');
        srCargarOTs(); // recargar OTs
    })
    .catch(function(err) {
        console.error('Error generando OT:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al generar la OT', 'danger');
    });
};

// ── Helpers de UI ─────────────────────────────────────────────────
function srBadgeSituacion(sit, ocupada) {
    if (!ocupada || !sit) return '<span class="sr-sit sr-sit-vacia">Vacía</span>';
    if (sit === 'En espera')  return '<span class="sr-sit sr-sit-espera">En espera</span>';
    if (sit === 'En proceso') return '<span class="sr-sit sr-sit-proceso">En proceso</span>';
    if (sit === 'Listo')      return '<span class="sr-sit sr-sit-listo">Listo</span>';
    return '<span class="sr-sit">' + sit + '</span>';
}

function srSemaforo(sit, ocupada) {
    if (!ocupada || !sit) return '<span class="sr-semaforo sr-sem-vacio"><span class="sr-sem-dot"></span>Libre</span>';
    if (sit === 'En espera')  return '<span class="sr-semaforo sr-sem-espera"><span class="sr-sem-dot"></span>En Espera</span>';
    if (sit === 'En proceso') return '<span class="sr-semaforo sr-sem-proceso"><span class="sr-sem-dot"></span>En Proceso</span>';
    if (sit === 'Listo')      return '<span class="sr-semaforo sr-sem-listo"><span class="sr-sem-dot"></span>Listo</span>';
    return '<span class="sr-semaforo sr-sem-vacio"><span class="sr-sem-dot"></span>' + sit + '</span>';
}

function srField(lbl, val) {
    return '<div class="sr-field"><span class="sr-field-lbl">' + lbl + '</span><span class="sr-field-val">' + val + '</span></div>';
}

function srFmtFecha(iso) {
    if (!iso) return '—';
    var parts = iso.split('-');
    if (parts.length !== 3) return iso;
    var meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return parts[2] + ' ' + meses[parseInt(parts[1],10) - 1] + ' ' + parts[0].slice(2);
}

// ── Helpers de drawers ───────────────────────────────────────────
function srAbrirDrawer(id) {
    var back = document.getElementById('srDrawerBackdrop');
    if (back) back.classList.add('open');
    var d = document.getElementById(id);
    if (d) d.classList.add('open');
}

window.srCerrarDrawers = function() {
    var back = document.getElementById('srDrawerBackdrop');
    if (back) back.classList.remove('open');
    ['sr-drawer-registro','sr-drawer-ot'].forEach(function(id) {
        var d = document.getElementById(id);
        if (d) d.classList.remove('open');
    });
    // Re-habilitar select rampa por si quedó deshabilitado
    var sRampa = document.getElementById('sr-f-rampa');
    if (sRampa) sRampa.disabled = false;
};

function srLimpiarFormRegistro() {
    ['sr-f-idx','sr-f-placa','sr-f-km','sr-f-fecha-ing','sr-f-hora-ing','sr-f-obs'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    var sSit = document.getElementById('sr-f-situacion');
    if (sSit) sSit.value = 'En espera';
    var sRampa = document.getElementById('sr-f-rampa');
    if (sRampa) { sRampa.value = ''; sRampa.disabled = false; }
}
