// ================================================================
// Módulo Órdenes de Mantenimiento — Azkell Fleet
// Patrón SPA: window.* globals, init_ordenes() entry point
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.otData      = window.otData      || [];
window.otTrbData   = window.otTrbData   || [];
window.otMatData   = window.otMatData   || [];
window.otBkData    = window.otBkData    || [];
window.otTabActiva = window.otTabActiva || 'ots';
window.otMatTabActiva = window.otMatTabActiva || 'pend';
window.otDetalleId = window.otDetalleId || null;  // ticket_entrada activo en panel
window._otPersonalLista = window._otPersonalLista || []; // caché de personal

// ── Multi-select técnicos (drawer nuevo trabajo) ──────────────────
window._otTrbSeleccionados = window._otTrbSeleccionados || [];

window.otTrbPersonalInit = function() {
    window._otTrbSeleccionados = [];
    var hidden = document.getElementById('trb-personal');
    if (hidden) hidden.value = '';
    otTrbMsRenderBox();
    var dd = document.getElementById('trb-ms-dropdown');
    if (dd) dd.style.display = 'none';
    var search = document.getElementById('trb-ms-search');
    if (search) search.value = '';
    var cnt = document.getElementById('trb-ms-count');
    if (cnt) cnt.textContent = '0 seleccionados';

    // Cargar lista si no está en caché
    if (window._otPersonalLista.length > 0) {
        otTrbMsRenderOptions('');
        return;
    }
    fetch('/api/conductores')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            var lista = Array.isArray(data) ? data : (data.data || []);
            window._otPersonalLista = lista.map(function(p) {
                var n = (p.nombre_completo || p.nombre || '').trim();
                return n.split(' ').map(function(w) {
                    return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '';
                }).join(' ');
            }).filter(Boolean).sort();
            otTrbMsRenderOptions('');
        })
        .catch(function() {});
};

window.otTrbMsToggle = function() {
    var dd = document.getElementById('trb-ms-dropdown');
    var box = document.getElementById('trb-ms-box');
    if (!dd) return;
    var isOpen = dd.style.display !== 'none';
    if (isOpen) {
        dd.style.display = 'none';
        if (box) box.style.borderColor = '';
    } else {
        dd.style.display = 'block';
        if (box) box.style.borderColor = 'var(--primary, #5865F2)';
        var search = document.getElementById('trb-ms-search');
        if (search) { search.value = ''; search.focus(); }
        otTrbMsRenderOptions('');
    }
};

window.otTrbMsFiltrar = function(query) {
    otTrbMsRenderOptions(query || '');
};

function otTrbMsRenderOptions(query) {
    var container = document.getElementById('trb-ms-options');
    if (!container) return;
    var q = (query || '').toLowerCase();
    var filtrados = window._otPersonalLista.filter(function(n) {
        return !q || n.toLowerCase().indexOf(q) !== -1;
    });
    if (filtrados.length === 0) {
        container.innerHTML = '<div style="padding:10px 14px; color:var(--subtext); font-size:0.83rem; text-align:center;">Sin resultados</div>';
        return;
    }
    container.innerHTML = filtrados.map(function(n) {
        var checked = window._otTrbSeleccionados.indexOf(n) !== -1;
        var nEsc = n.replace(/'/g, "\\'");
        return '<label style="display:flex; align-items:center; gap:10px; padding:9px 14px; cursor:pointer; font-size:0.85rem; color:var(--text);" '
            + 'onmouseenter="this.style.background=\'var(--bg)\'" onmouseleave="this.style.background=\'\'">'
            + '<input type="checkbox" ' + (checked ? 'checked' : '') + ' '
            + 'onclick="event.stopPropagation(); otTrbMsToggleItem(\'' + nEsc + '\')" '
            + 'style="accent-color:var(--primary, #5865F2); width:14px; height:14px; cursor:pointer; flex-shrink:0;">'
            + n
            + '</label>';
    }).join('');
}

window.otTrbMsToggleItem = function(nombre) {
    var idx = window._otTrbSeleccionados.indexOf(nombre);
    if (idx === -1) window._otTrbSeleccionados.push(nombre);
    else window._otTrbSeleccionados.splice(idx, 1);
    otTrbMsRenderBox();
    otTrbMsRenderOptions((document.getElementById('trb-ms-search') || {}).value || '');
    var cnt = document.getElementById('trb-ms-count');
    if (cnt) cnt.textContent = window._otTrbSeleccionados.length + ' seleccionados';
    var hidden = document.getElementById('trb-personal');
    if (hidden) hidden.value = window._otTrbSeleccionados.join(', ');
};

window.otTrbMsLimpiar = function() {
    window._otTrbSeleccionados = [];
    otTrbMsRenderBox();
    otTrbMsRenderOptions('');
    var cnt = document.getElementById('trb-ms-count');
    if (cnt) cnt.textContent = '0 seleccionados';
    var hidden = document.getElementById('trb-personal');
    if (hidden) hidden.value = '';
};

function otTrbMsRenderBox() {
    var box = document.getElementById('trb-ms-box');
    if (!box) return;
    var sel = window._otTrbSeleccionados;
    if (sel.length === 0) {
        box.innerHTML = '<span style="color:var(--subtext); font-size:0.85rem;">Selecciona técnico(s)...</span>';
    } else {
        box.innerHTML = sel.map(function(n) {
            var nEsc = n.replace(/'/g, "\\'");
            return '<span style="display:inline-flex; align-items:center; gap:4px; background:var(--primary, #5865F2); color:#fff; padding:3px 8px 3px 10px; border-radius:6px; font-size:0.76rem; font-weight:600;">'
                + n
                + '<span style="cursor:pointer; opacity:0.8; font-size:1rem; line-height:1;" '
                + 'onmousedown="event.stopPropagation(); event.preventDefault(); otTrbMsToggleItem(\'' + nEsc + '\')">×</span>'
                + '</span>';
        }).join('');
    }
}

// Cerrar dropdown al hacer clic fuera (safe para SPA re-init)
window._otTrbMsOutsideClick = function(e) {
    var wrapper = document.getElementById('trb-ms-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        var dd = document.getElementById('trb-ms-dropdown');
        var box = document.getElementById('trb-ms-box');
        if (dd) dd.style.display = 'none';
        if (box) box.style.borderColor = '';
    }
};
document.removeEventListener('click', window._otTrbMsOutsideClick);
document.addEventListener('click', window._otTrbMsOutsideClick);

// ── Entry point ──────────────────────────────────────────────────
window.init_ordenes = function() {
    if (!window.checkPerm('ot', 'l')) {
        window.showNoPermMsg('root-dinamico');
        return;
    }
    window.enforceModuleUI('ot');

    // Ocultar botón Nueva OT si no puede crear
    var btnNuevo = document.getElementById('btn-nueva-ot');
    if (btnNuevo) btnNuevo.style.display = window.checkPerm('ot', 'c') ? '' : 'none';
    var btnBk = document.getElementById('btn-nuevo-backlog');
    if (btnBk) btnBk.style.display = window.checkPerm('ot', 'c') ? '' : 'none';

    otCargarTodo();
};

// ── Carga de datos ────────────────────────────────────────────────
window.otCargarTodo = function(cb) {
    Promise.all([
        fetch('/api/ordenes-trabajo').then(function(r){ return r.json(); }),
        fetch('/api/ot-trabajos').then(function(r){ return r.json(); }),
        fetch('/api/ot-materiales').then(function(r){ return r.json(); }),
        fetch('/api/ot-backlog').then(function(r){ return r.json(); })
    ]).then(function(results) {
        window.otData    = Array.isArray(results[0]) ? results[0] : [];
        window.otTrbData = Array.isArray(results[1]) ? results[1] : [];
        window.otMatData = Array.isArray(results[2]) ? results[2] : [];
        window.otBkData  = Array.isArray(results[3]) ? results[3] : [];
        otActualizarKPIs();
        otActualizarBadgesTabs();
        otRenderTabActiva();
        if (typeof cb === 'function') cb();
    }).catch(function(err) {
        console.error('Error cargando OTs:', err);
        window.mostrarAlerta('Error al cargar órdenes de mantenimiento', 'danger');
    });
};

// ── Helpers ──────────────────────────────────────────────────────
function otFmtMoney(val) { return 'S/.' + parseFloat(val || 0).toFixed(2); }
function otFmtFecha(iso) {
    if (!iso) return '—';
    var s = typeof iso === 'string' ? iso.split('T')[0] : String(iso);
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' });
}
function otFmtDateTime(iso) {
    if (!iso) return '—';
    // Tratar como hora local: quitar 'Z' o '+00:00' para evitar conversión UTC→local
    var s = String(iso).replace('Z', '').replace('+00:00', '');
    if (s.indexOf('T') === -1) s = s.replace(' ', 'T');
    var d = new Date(s);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) + ' ' +
           d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function otBadgeAprobacion(estado) {
    var map = {
        'Pendiente': ['badge-pendiente', 'Pendiente'],
        'Aprobada':  ['badge-aprobada',  'Aprobada'],
        'Cerrada':   ['badge-cerrada',   'Cerrada'],
        'Anulado':   ['badge-anulado',   'Anulado']
    };
    var v = map[estado] || ['badge-pendiente', estado || '—'];
    return '<span class="ot-badge ' + v[0] + '">' + v[1] + '</span>';
}

function otBadgeSituacion(sit) {
    if (!sit) return '—';
    var map = {
        'En atención':               ['badge-en-atencion', 'En Atención'],
        'Espera de repuesto':        ['badge-espera',      'Espera Repuesto'],
        'Espera de autorización':    ['badge-espera',      'Espera Autor.'],
        'Finalizado':                ['badge-finalizado',  'Finalizado']
    };
    var v = map[sit] || [null, sit];
    return v[0] ? '<span class="ot-badge ' + v[0] + '">' + v[1] + '</span>' : sit;
}

function otBadgeTipo(tipo) {
    if (!tipo) return '—';
    return tipo === 'Preventivo'
        ? '<span class="ot-badge badge-tipo-prev">Prev.</span>'
        : '<span class="ot-badge badge-tipo-corr">Corr.</span>';
}

// Extrae campo detalles_json de una OT
function otDetalles(ot) {
    if (!ot) return {};
    try { return (typeof ot.detalles_json === 'string') ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {}); }
    catch(e) { return {}; }
}

// Costos de una OT (suma trabajos aprobados + materiales despachados)
function otCalcCosto(ticketId) {
    var trb = window.otTrbData
        .filter(function(t){ return t.ticket_visita === ticketId && t.estado === 'Aprobado'; })
        .reduce(function(s, t){ var d = otDetallesTrb(t); return s + (parseFloat(d.costo) || 0); }, 0);
    var mat = window.otMatData
        .filter(function(m){ return m.ticket_ot === ticketId && m.estado === 'Despachado'; })
        .reduce(function(s, m){ return s + (parseFloat(m.costo_total) || 0); }, 0);
    return trb + mat;
}

function otDetallesTrb(trb) {
    if (!trb) return {};
    try { return (typeof trb.detalles_json === 'string') ? JSON.parse(trb.detalles_json) : (trb.detalles_json || {}); }
    catch(e) { return {}; }
}

// ── KPIs ──────────────────────────────────────────────────────────
function otActualizarKPIs() {
    var total = window.otData.length;
    var pendiente = 0, aprobada = 0, cerrada = 0, costoTotal = 0;
    window.otData.forEach(function(ot) {
        var d = otDetalles(ot);
        var apr = d.aprobacion || 'Pendiente';
        if (apr === 'Pendiente') pendiente++;
        else if (apr === 'Aprobada') aprobada++;
        else if (apr === 'Cerrada') cerrada++;
        costoTotal += parseFloat(d.costo_total || 0);
    });
    var el;
    el = document.getElementById('kpi-ot-total');    if (el) el.textContent = total;
    el = document.getElementById('kpi-ot-pendiente');if (el) el.textContent = pendiente;
    el = document.getElementById('kpi-ot-aprobada'); if (el) el.textContent = aprobada;
    el = document.getElementById('kpi-ot-cerrada');  if (el) el.textContent = cerrada;
    el = document.getElementById('kpi-ot-costo');    if (el) el.textContent = otFmtMoney(costoTotal);
}

function otActualizarBadgesTabs() {
    var bOts = document.getElementById('ot-badge-ots');
    var bTrb = document.getElementById('ot-badge-trb');
    var bMat = document.getElementById('ot-badge-mat');
    var bBk  = document.getElementById('ot-badge-bk');
    if (bOts) bOts.textContent = window.otData.length;
    if (bTrb) bTrb.textContent = window.otTrbData.length;
    if (bMat) bMat.textContent = window.otMatData.length;
    if (bBk)  bBk.textContent  = window.otBkData.filter(function(b){ return b.estado !== 'Realizado'; }).length;
}

// ── Tabs ──────────────────────────────────────────────────────────
window.otCambiarTab = function(tab) {
    window.otTabActiva = tab;
    ['ots','trabajos','materiales','backlog'].forEach(function(t) {
        var panelEl = document.getElementById('ot-panel-' + t);
        var tabEl   = document.getElementById('ot-tab-' + t);
        if (panelEl) panelEl.style.display = (t === tab) ? '' : 'none';
        if (tabEl)   tabEl.classList.toggle('active', t === tab);
    });
    // KPI bar: solo en OTs
    var kpiBar = document.getElementById('ot-kpi-bar');
    if (kpiBar) kpiBar.style.display = (tab === 'ots') ? '' : 'none';
    otRenderTabActiva();
};

function otRenderTabActiva() {
    var t = window.otTabActiva;
    if (t === 'ots')        otRenderTabla();
    else if (t === 'trabajos')  otRenderTrabajosTabla();
    else if (t === 'materiales') otRenderMaterilaesTabla();
    else if (t === 'backlog')    otRenderBacklogTabla();
}

// ── Filtros ───────────────────────────────────────────────────────
window.otFiltrar = function() { otRenderTabActiva(); };

function otGetFiltros() {
    var search = (document.getElementById('ot-search') || {}).value || '';
    return {
        search: search.toLowerCase(),
        tipo:    (document.getElementById('ot-fil-tipo') || {}).value || '',
        aprob:   (document.getElementById('ot-fil-aprobacion') || {}).value || '',
        mes:     (document.getElementById('ot-fil-mes') || {}).value || ''
    };
}

// ── TABLA OTs ─────────────────────────────────────────────────────
function otRenderTabla() {
    var tbody = document.getElementById('ot-tbody-ots');
    if (!tbody) return;
    var f = otGetFiltros();
    var datos = window.otData.filter(function(ot) {
        var d = otDetalles(ot);
        var apr = d.aprobacion || 'Pendiente';
        var fechaStr = ot.fecha_ingreso ? String(ot.fecha_ingreso).split('T')[0] : '';
        if (f.tipo && d.tipo_ot !== f.tipo) return false;
        if (f.aprob && apr !== f.aprob) return false;
        if (f.mes && !fechaStr.startsWith(f.mes)) return false;
        if (f.search) {
            var s = [ot.id_ot, ot.placa, d.supervisor, d.tipo_ot].join(' ').toLowerCase();
            if (!s.includes(f.search)) return false;
        }
        return true;
    });

    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="td-placeholder"><i class="bi bi-inbox" style="font-size:1.5rem; opacity:0.3"></i><br>Sin órdenes de trabajo</td></tr>';
        return;
    }
    tbody.innerHTML = '';
    datos.forEach(function(ot) {
        var d = otDetalles(ot);
        var apr = d.aprobacion || 'Pendiente';
        var costo = otCalcCosto(ot.ticket_entrada);
        // Actualizar costo en cache local
        d.costo_total = costo;
        var tr = document.createElement('tr');
        if (ot.ticket_entrada === window.otDetalleId) tr.classList.add('ot-row-active');
        tr.innerHTML = '<td><span class="fw-bold" style="color:var(--primary,#5865F2);">' + (ot.id_ot || '—') + '</span></td>'
            + '<td><strong>' + (ot.placa || '—') + '</strong></td>'
            + '<td>' + otBadgeTipo(d.tipo_ot) + ' <small style="color:var(--subtext);">' + (d.sub_tipo || '') + '</small></td>'
            + '<td>' + (d.supervisor || '—') + '</td>'
            + '<td>' + otFmtFecha(ot.fecha_ingreso) + '</td>'
            + '<td>' + otBadgeSituacion(ot.estado) + '</td>'
            + '<td>' + otBadgeAprobacion(apr) + '</td>'
            + '<td><strong style="color:#16a34a;">' + otFmtMoney(costo) + '</strong></td>';
        tr.onclick = function() { otAbrirDetalle(ot.ticket_entrada); };
        tbody.appendChild(tr);
    });
}

// ── DETALLE OT ────────────────────────────────────────────────────
function otAbrirDetalle(ticketId) {
    window.otDetalleId = ticketId;
    var ot = window.otData.find(function(o){ return o.ticket_entrada === ticketId; });
    if (!ot) return;
    var d = otDetalles(ot);
    var apr = d.aprobacion || 'Pendiente';

    var canEdit   = window.checkPerm('ot', 'e');
    var canDelete = window.checkPerm('ot', 'd');

    var titulo = document.getElementById('ot-detalle-titulo');
    if (titulo) titulo.textContent = ot.id_ot || 'Detalle OT';

    // Backlog pendiente de esta placa
    var bkPlaca = window.otBkData.filter(function(b){
        return b.placa && ot.placa && b.placa.toLowerCase() === ot.placa.toLowerCase() && b.estado !== 'Realizado';
    });

    // Trabajos de esta OT
    var trabajos = window.otTrbData.filter(function(t){ return t.ticket_visita === ticketId; });
    // Materiales de esta OT
    var materiales = window.otMatData.filter(function(m){ return m.ticket_ot === ticketId; });

    var costo = otCalcCosto(ticketId);

    var html = '';
    // Encabezado
    html += '<div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:0.75rem;">';
    html += '<div><div style="font-size:1.4rem; font-weight:800; color:var(--text);">' + (ot.id_ot || '—') + '</div>';
    html += '<div style="font-size:0.85rem; color:var(--subtext); font-weight:600;">' + (ot.placa || 'Sin placa') + '</div></div>';
    html += '</div>';

    if (apr === 'Pendiente') {
        html += '<div style="background:rgba(217,119,6,0.1); border:1px solid rgba(217,119,6,0.3); color:#d97706; padding:10px; border-radius:8px; margin-bottom:1rem; font-size:0.8rem; font-weight:700; text-align:center;">⚠️ PENDIENTE DE APROBACIÓN</div>';
    }

    // Backlog pendiente
    if (bkPlaca.length > 0) {
        html += '<div class="ot-sec">';
        html += '<div class="ot-sec-hd" style="background:rgba(217,119,6,0.1); color:#d97706;">Mantenimientos por Atender <span style="background:rgba(217,119,6,0.2); color:#d97706; padding:1px 7px; border-radius:10px; font-size:0.7rem;">' + bkPlaca.length + '</span></div>';
        html += '<table class="ot-mini-table"><thead><tr><th>Fecha</th><th>Tema</th><th>Tarea</th></tr></thead><tbody>';
        bkPlaca.forEach(function(b) {
            html += '<tr><td>' + otFmtFecha(b.fecha_reporte) + '</td><td>' + (b.tema || '—') + '</td><td style="white-space:normal; max-width:160px;">' + (b.tarea || '—') + '</td></tr>';
        });
        html += '</tbody></table></div>';
    }

    // Sección I: Información OT
    html += '<div class="ot-sec">';
    html += '<div class="ot-sec-hd">I. Información de la OT</div>';
    html += '<div class="ot-field"><div class="ot-field-lbl">Estado</div><div class="ot-field-val">' + otBadgeAprobacion(apr) + '</div></div>';
    html += '<div class="ot-field"><div class="ot-field-lbl">Situación</div><div class="ot-field-val">' + otBadgeSituacion(ot.estado) + '</div></div>';
    html += '<div class="ot-field"><div class="ot-field-lbl">Tipo OT</div><div class="ot-field-val">' + (d.tipo_ot || '—') + ' / ' + (d.sub_tipo || '—') + '</div></div>';
    html += '<div class="ot-field"><div class="ot-field-lbl">Supervisor</div><div class="ot-field-val">' + (d.supervisor || '—') + '</div></div>';
    html += '<div class="ot-field"><div class="ot-field-lbl">F. Ingreso</div><div class="ot-field-val">' + otFmtDateTime(ot.fecha_ingreso) + '</div></div>';
    html += '<div class="ot-field"><div class="ot-field-lbl">Kilometraje</div><div class="ot-field-val">' + (d.km ? d.km + ' km' : '—') + '</div></div>';
    if (d.motivo) html += '<div class="ot-field"><div class="ot-field-lbl">Motivo</div><div class="ot-field-val" style="white-space:normal;">' + d.motivo + '</div></div>';
    html += '</div>';

    // Sección II: Cierre (si aplica)
    if (apr === 'Cerrada') {
        html += '<div class="ot-sec">';
        html += '<div class="ot-sec-hd">II. Cierre y Finalización</div>';
        html += '<div class="ot-field"><div class="ot-field-lbl">Técnico Cierre</div><div class="ot-field-val">' + (d.tecnico_cierre || '—') + '</div></div>';
        html += '<div class="ot-field"><div class="ot-field-lbl">F. Salida</div><div class="ot-field-val">' + otFmtDateTime(ot.fecha_hora_salida) + '</div></div>';
        if (d.obs_cierre) html += '<div class="ot-field"><div class="ot-field-lbl">Obs. Finales</div><div class="ot-field-val" style="white-space:normal;">' + d.obs_cierre + '</div></div>';
        if (d.firma) html += '<div class="ot-field" style="flex-direction:column;"><div class="ot-field-lbl" style="width:100%;margin-bottom:5px;">Firma</div><img src="' + d.firma + '" style="max-width:180px; max-height:70px; border:1px solid var(--border); border-radius:4px; padding:4px; background:var(--surface);"></div>';
        html += '</div>';
    }

    // Sección III: Trabajos
    html += '<div class="ot-sec">';
    html += '<div class="ot-sec-hd">Trabajos <span style="background:var(--surface); border:1px solid var(--border); color:var(--subtext); padding:1px 6px; border-radius:10px; font-size:0.7rem;">' + trabajos.length + '</span></div>';
    if (trabajos.length > 0) {
        html += '<table class="ot-mini-table"><thead><tr><th>ID</th><th>Descripción</th><th>Estado</th><th>Costo</th></tr></thead><tbody>';
        trabajos.forEach(function(t) {
            var td = otDetallesTrb(t);
            html += '<tr onclick="otAbrirDetalleTrabajo(\'' + t.id_ot + '\')">'
                + '<td><span class="ot-link">' + t.id_ot + '</span></td>'
                + '<td style="white-space:normal; max-width:100px; font-size:0.75rem;">' + (t.trabajo_realizado || '—') + '</td>'
                + '<td>' + (t.estado === 'Aprobado' ? '<span class="ot-badge badge-aprobada">Aprobado</span>' : '<span class="ot-badge badge-pendiente">Pendiente</span>') + '</td>'
                + '<td>' + otFmtMoney(td.costo) + '</td></tr>';
        });
        html += '</tbody></table>';
    } else {
        html += '<div class="ot-empty">Sin trabajos registrados</div>';
    }
    if (apr === 'Aprobada' && window.checkPerm('ot', 'c')) {
        html += '<div class="ot-sec-footer"><span class="ot-link" onclick="window.otAbrirFormTrabajo(\'' + ticketId + '\')">+ Agregar Trabajo</span></div>';
    }
    html += '</div>';

    // Sección IV: Materiales
    html += '<div class="ot-sec">';
    html += '<div class="ot-sec-hd">Materiales <span style="background:var(--surface); border:1px solid var(--border); color:var(--subtext); padding:1px 6px; border-radius:10px; font-size:0.7rem;">' + materiales.length + '</span></div>';
    if (materiales.length > 0) {
        html += '<table class="ot-mini-table"><thead><tr><th>Producto</th><th>Cant.</th><th>Estado</th><th>Total</th></tr></thead><tbody>';
        materiales.forEach(function(m) {
            html += '<tr>'
                + '<td>' + (m.producto || '—') + '</td>'
                + '<td>' + (m.cantidad || '—') + ' ' + (m.unidad_medida || '') + '</td>'
                + '<td>' + (m.estado === 'Despachado' ? '<span class="ot-badge badge-aprobada">Despachado</span>' : '<span class="ot-badge badge-pendiente">Pendiente</span>') + '</td>'
                + '<td>' + otFmtMoney(m.costo_total) + '</td></tr>';
        });
        html += '</tbody></table>';
    } else {
        html += '<div class="ot-empty">Sin solicitudes de material</div>';
    }
    if (apr === 'Aprobada' && window.checkPerm('ot', 'c')) {
        html += '<div class="ot-sec-footer"><span class="ot-link" onclick="window.otAbrirFormMaterial(\'' + ticketId + '\')">+ Solicitar Material</span></div>';
    }
    html += '</div>';

    // Sección V: Costos totales
    html += '<div class="ot-sec" style="border-color:rgba(22,163,74,0.3);">';
    html += '<div class="ot-sec-hd" style="background:rgba(22,163,74,0.08); color:#16a34a;">Costos Totales (Aprobados)</div>';
    html += '<div class="ot-field"><div class="ot-field-lbl">Costo OT</div><div class="ot-field-val"><span style="font-size:1.1rem; color:#16a34a;">' + otFmtMoney(costo) + '</span></div></div>';
    html += '</div>';

    var scroll = document.getElementById('ot-detalle-scroll');
    if (scroll) scroll.innerHTML = html;

    // Footer con acciones
    var footer = document.getElementById('ot-detalle-footer');
    if (footer) {
        footer.style.display = 'flex';
        var footHtml = '';
        if (apr === 'Pendiente') {
            if (canDelete) footHtml += '<button class="btn btn-sm btn-outline-danger" onclick="otEliminarOT(\'' + ticketId + '\')" style="flex:0.4;">🗑 Eliminar</button>';
            if (canEdit)   footHtml += '<button class="btn btn-sm btn-success flex-fill" onclick="otAprobarOT(\'' + ticketId + '\')">✔ Aprobar OT</button>';
        } else if (apr === 'Aprobada') {
            if (canEdit) footHtml += '<button class="btn btn-sm btn-warning flex-fill" onclick="window.otAbrirFormCierre(\'' + ticketId + '\')"><i class="bi bi-lock-fill me-1"></i>Cerrar OT</button>';
            footHtml += '<button class="btn btn-sm btn-primary" onclick="otGenerarPDF(\'' + ticketId + '\')"><i class="bi bi-file-pdf me-1"></i>PDF</button>';
            if (canDelete) footHtml += '<button class="btn btn-sm btn-outline-danger" onclick="otEliminarOT(\'' + ticketId + '\')">🗑</button>';
        } else if (apr === 'Cerrada') {
            footHtml += '<button class="btn btn-sm btn-primary flex-fill" onclick="otGenerarPDF(\'' + ticketId + '\')"><i class="bi bi-file-pdf me-1"></i>Imprimir PDF Final</button>';
        }
        footer.innerHTML = footHtml;
    }

    var panel = document.getElementById('ot-panel-detalle');
    if (panel) panel.classList.add('open');

    // Re-render tabla para marcar fila activa
    if (window.otTabActiva === 'ots') otRenderTabla();
}

window.otCerrarDetalle = function() {
    var panel = document.getElementById('ot-panel-detalle');
    if (panel) panel.classList.remove('open');
    window.otDetalleId = null;
    if (window.otTabActiva === 'ots') otRenderTabla();
};

// Detalle de trabajo individual
function otAbrirDetalleTrabajo(idTrabajo) {
    var t = window.otTrbData.find(function(x){ return x.id_ot === idTrabajo; });
    if (!t) return;
    var td = otDetallesTrb(t);
    var canEdit = window.checkPerm('ot', 'e');
    var scroll = document.getElementById('ot-detalle-scroll');
    if (!scroll) return;

    var html = '';
    html += '<div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.75rem;">';
    html += '<div><div style="font-size:1.2rem; font-weight:800;">' + t.id_ot + '</div><div style="font-size:0.82rem; color:var(--subtext);">Trabajo de: <span class="ot-link" onclick="otAbrirDetalle(\'' + t.ticket_visita + '\')">' + t.ticket_visita + '</span></div></div></div>';
    html += '<div class="ot-sec"><div class="ot-sec-hd">Detalle del Trabajo</div>';
    html += '<div class="ot-field"><div class="ot-field-lbl">Estado</div><div class="ot-field-val">' + (t.estado === 'Aprobado' ? '<span class="ot-badge badge-aprobada">Aprobado</span>' : '<span class="ot-badge badge-pendiente">Pendiente</span>') + '</div></div>';
    html += '<div class="ot-field"><div class="ot-field-lbl">Personal</div><div class="ot-field-val" style="white-space:normal;">' + (td.personal || '—') + '</div></div>';
    html += '<div class="ot-field"><div class="ot-field-lbl">Descripción</div><div class="ot-field-val" style="white-space:normal;">' + (t.trabajo_realizado || '—') + '</div></div>';
    html += '<div class="ot-field"><div class="ot-field-lbl">F. Inicio</div><div class="ot-field-val">' + (t.fecha_trabajo ? otFmtFecha(t.fecha_trabajo) + ' ' + (td.hora_ini || '') : '—') + '</div></div>';
    html += '<div class="ot-field"><div class="ot-field-lbl">F. Fin</div><div class="ot-field-val">' + (t.fecha_salida ? otFmtDateTime(t.fecha_salida) : '—') + '</div></div>';
    html += '<div class="ot-field"><div class="ot-field-lbl">Costo M.O.</div><div class="ot-field-val"><span style="color:#16a34a; font-size:1.05rem;">' + otFmtMoney(td.costo) + '</span></div></div>';
    html += '</div>';
    scroll.innerHTML = html;

    var footer = document.getElementById('ot-detalle-footer');
    if (footer) {
        footer.style.display = 'flex';
        if (t.estado !== 'Aprobado' && canEdit) {
            footer.innerHTML = '<button class="btn btn-sm btn-success flex-fill" onclick="otAprobarTrabajo(\'' + t.id_ot + '\')">✔ Aprobar Trabajo</button>';
        } else {
            footer.innerHTML = '<button class="btn btn-sm btn-outline-secondary" onclick="otAbrirDetalle(\'' + t.ticket_visita + '\')"><i class="bi bi-arrow-left me-1"></i>Volver a OT</button>';
        }
    }
}

// ── TABLA TRABAJOS ────────────────────────────────────────────────
function otRenderTrabajosTabla() {
    var tbody = document.getElementById('ot-tbody-trabajos');
    if (!tbody) return;
    var f = otGetFiltros();
    var datos = window.otTrbData.filter(function(t) {
        var ot = window.otData.find(function(o){ return o.ticket_entrada === t.ticket_visita; });
        var placa = ot ? ot.placa : '';
        if (f.search) {
            var s = [t.id_ot, t.ticket_visita, placa, t.trabajo_realizado || ''].join(' ').toLowerCase();
            if (!s.includes(f.search)) return false;
        }
        return true;
    });
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="td-placeholder"><i class="bi bi-tools" style="font-size:1.5rem; opacity:0.3"></i><br>Sin trabajos registrados</td></tr>';
        return;
    }
    tbody.innerHTML = '';
    datos.forEach(function(t) {
        var td = otDetallesTrb(t);
        var ot = window.otData.find(function(o){ return o.ticket_entrada === t.ticket_visita; });
        var tr = document.createElement('tr');
        tr.innerHTML = '<td><span class="fw-bold" style="color:var(--primary,#5865F2);">' + t.id_ot + '</span></td>'
            + '<td><span class="ot-link" onclick="otAbrirDetalle(\'' + t.ticket_visita + '\'); event.stopPropagation();">' + t.ticket_visita + '</span></td>'
            + '<td><strong>' + (ot ? ot.placa : '—') + '</strong></td>'
            + '<td>' + (td.personal || '—') + '</td>'
            + '<td>' + (t.fecha_trabajo ? otFmtFecha(t.fecha_trabajo) : '—') + '</td>'
            + '<td>' + (t.fecha_salida ? otFmtDateTime(t.fecha_salida) : '—') + '</td>'
            + '<td><strong style="color:#16a34a;">' + otFmtMoney(td.costo) + '</strong></td>'
            + '<td>' + (t.estado === 'Aprobado' ? '<span class="ot-badge badge-aprobada">Aprobado</span>' : '<span class="ot-badge badge-pendiente">Pendiente</span>') + '</td>';
        tr.onclick = function() { otAbrirDetalleTrabajo(t.id_ot); };
        tbody.appendChild(tr);
    });
}

// ── TABLA MATERIALES ──────────────────────────────────────────────
window.otMatTab = function(tab) {
    window.otMatTabActiva = tab;
    var pend = document.getElementById('mat-tab-pend');
    var desp = document.getElementById('mat-tab-desp');
    if (pend) pend.classList.toggle('active', tab === 'pend');
    if (desp) desp.classList.toggle('active', tab === 'desp');
    otRenderMaterilaesTabla();
};

function otRenderMaterilaesTabla() {
    var tbody = document.getElementById('ot-tbody-materiales');
    if (!tbody) return;
    var f = otGetFiltros();
    var datos = window.otMatData.filter(function(m) {
        var esDespachado = m.estado === 'Despachado';
        if (window.otMatTabActiva === 'pend' && esDespachado) return false;
        if (window.otMatTabActiva === 'desp' && !esDespachado) return false;
        if (f.search) {
            var ot = window.otData.find(function(o){ return o.ticket_entrada === m.ticket_ot; });
            var s = [m.id_solicitud, m.ticket_ot, ot ? ot.placa : '', m.producto || ''].join(' ').toLowerCase();
            if (!s.includes(f.search)) return false;
        }
        return true;
    });
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="td-placeholder"><i class="bi bi-box" style="font-size:1.5rem; opacity:0.3"></i><br>Sin solicitudes de material</td></tr>';
        return;
    }
    tbody.innerHTML = '';
    var canEditMat = window.checkPerm('ot', 'e');
    datos.forEach(function(m) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td><span class="fw-bold" style="color:var(--primary,#5865F2);">' + (m.id_solicitud || '—') + '</span></td>'
            + '<td><span class="ot-link" onclick="otAbrirDetalle(\'' + m.ticket_ot + '\'); event.stopPropagation();">' + (m.ticket_ot || '—') + '</span></td>'
            + '<td>' + (m.producto || '—') + '</td>'
            + '<td>' + (m.cantidad || '—') + '</td>'
            + '<td>' + otFmtMoney(m.costo_unit) + '</td>'
            + '<td><strong style="color:#16a34a;">' + otFmtMoney(m.costo_total) + '</strong></td>'
            + '<td>' + (m.personal_solicitante || '—') + '</td>'
            + '<td>' + (m.estado === 'Despachado' ? '<span class="ot-badge badge-aprobada">Despachado</span>' : (canEditMat ? '<button class="btn btn-xs btn-outline-success" onclick="otDespacharMaterial(' + m.id + '); event.stopPropagation();" style="font-size:0.7rem; padding:2px 8px;">Despachar</button>' : '<span class="ot-badge badge-pendiente">Pendiente</span>')) + '</td>';
        tbody.appendChild(tr);
    });
}

// ── TABLA BACKLOG ─────────────────────────────────────────────────
function otRenderBacklogTabla() {
    var tbody = document.getElementById('ot-tbody-backlog');
    if (!tbody) return;
    var f = otGetFiltros();
    var datos = window.otBkData.filter(function(b) {
        if (f.search) {
            var s = [b.backlog_id, b.placa, b.tema, b.reportado_por].join(' ').toLowerCase();
            if (!s.includes(f.search)) return false;
        }
        return true;
    });
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="td-placeholder"><i class="bi bi-list-task" style="font-size:1.5rem; opacity:0.3"></i><br>Sin tareas en backlog</td></tr>';
        return;
    }
    tbody.innerHTML = '';
    var canEdit = window.checkPerm('ot', 'e');
    datos.forEach(function(b) {
        var tr = document.createElement('tr');
        var estadoBadge = b.estado === 'Realizado'
            ? '<span class="ot-badge badge-aprobada">Realizado</span>'
            : (canEdit ? '<button class="btn btn-xs btn-outline-success" onclick="otMarcarBkRealizado(' + b.id + '); event.stopPropagation();" style="font-size:0.7rem; padding:2px 8px;">Marcar Realizado</button>' : '<span class="ot-badge badge-pendiente">Pendiente</span>');
        tr.innerHTML = '<td>' + otFmtFecha(b.fecha_reporte) + '</td>'
            + '<td><strong>' + (b.tema || '—') + '</strong></td>'
            + '<td><strong>' + (b.placa || '—') + '</strong></td>'
            + '<td>' + (b.km || '—') + '</td>'
            + '<td>' + (b.reportado_por || '—') + '</td>'
            + '<td style="white-space:normal; max-width:220px;">' + (b.tarea || '—') + '</td>'
            + '<td>' + estadoBadge + '</td>';
        tbody.appendChild(tr);
    });
}

// ── ACCIONES OT ───────────────────────────────────────────────────
function otAprobarOT(ticketId) {
    if (!window.guardAction('ot', 'e')) return;
    if (!confirm('¿Deseas APROBAR esta Orden de Trabajo? Una vez aprobada se podrán registrar trabajos y materiales.')) return;
    fetch('/api/ordenes-trabajo/' + encodeURIComponent(ticketId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'aprobar', usuario: localStorage.getItem('fleet_correo') || '' })
    }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function() {
        window.otCargarTodo();
        window.mostrarAlerta('OT aprobada exitosamente', 'success');
    }).catch(function(err) {
        console.error(err);
        window.mostrarAlerta('Error al aprobar la OT', 'danger');
    });
}

function otEliminarOT(ticketId) {
    if (!window.guardAction('ot', 'd')) return;
    if (!confirm('¿Estás seguro de eliminar esta Orden de Trabajo? Esta acción no se puede deshacer.')) return;
    fetch('/api/ordenes-trabajo/' + encodeURIComponent(ticketId), { method: 'DELETE' })
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function() {
            window.otDetalleId = null;
            window.otCargarTodo();
            otCerrarDetalle();
            window.mostrarAlerta('OT eliminada', 'success');
        }).catch(function(err) {
            console.error(err);
            window.mostrarAlerta('Error al eliminar la OT', 'danger');
        });
}

function otAprobarTrabajo(idTrabajo) {
    if (!window.guardAction('ot', 'e')) return;
    fetch('/api/ot-trabajos/' + encodeURIComponent(idTrabajo), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'aprobar', usuario: localStorage.getItem('fleet_correo') || '' })
    }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function() {
        window.otCargarTodo();
        window.mostrarAlerta('Trabajo aprobado', 'success');
    }).catch(function(err) { console.error(err); window.mostrarAlerta('Error al aprobar trabajo', 'danger'); });
}

function otDespacharMaterial(id) {
    if (!window.guardAction('ot', 'e')) return;
    fetch('/api/ot-materiales/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'despachar', usuario: localStorage.getItem('fleet_correo') || '' })
    }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function() {
        window.otCargarTodo();
        window.mostrarAlerta('Material despachado', 'success');
    }).catch(function(err) { console.error(err); window.mostrarAlerta('Error al despachar material', 'danger'); });
}

function otMarcarBkRealizado(id) {
    if (!window.guardAction('ot', 'e')) return;
    fetch('/api/ot-backlog/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'Realizado' })
    }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function() {
        window.otCargarTodo();
        window.mostrarAlerta('Tarea marcada como realizada', 'success');
    }).catch(function(err) { console.error(err); window.mostrarAlerta('Error al actualizar backlog', 'danger'); });
}

// ── DRAWER helpers ────────────────────────────────────────────────
window.otCerrarTodosDrawers = function() {
    ['drawer-nueva-ot','drawer-cierre-ot','drawer-nuevo-trabajo','drawer-nuevo-material','drawer-nuevo-backlog'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('open');
    });
    var bd = document.getElementById('otDrawerBackdrop');
    if (bd) bd.classList.remove('open');
};

function otAbrirDrawer(id) {
    window.otCerrarTodosDrawers();
    var el = document.getElementById(id);
    if (el) el.classList.add('open');
    var bd = document.getElementById('otDrawerBackdrop');
    if (bd) bd.classList.add('open');
}

// Genera ID secuencial basado en datos existentes
function otGenId(prefix, existentes) {
    var anio = new Date().getFullYear();
    var base = prefix + '-' + anio + '-';
    var maxNum = 0;
    existentes.forEach(function(id) {
        if (id && id.startsWith(base)) {
            var num = parseInt(id.replace(base, ''), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        }
    });
    return base + String(maxNum + 1).padStart(3, '0');
}

// ── FORM Nueva OT ─────────────────────────────────────────────────
window.otAbrirFormNuevo = function() {
    if (!window.guardAction('ot', 'c')) return;
    var nuevoId = otGenId('OT', window.otData.map(function(o){ return o.id_ot; }));
    var el;
    el = document.getElementById('drawer-ot-id');    if (el) el.textContent = nuevoId;
    el = document.getElementById('drawer-ot-fecha'); if (el) el.textContent = new Date().toLocaleDateString('es-PE');
    el = document.getElementById('drawer-ot-edit-id'); if (el) el.value = '';
    el = document.getElementById('drawer-ot-titulo'); if (el) el.textContent = 'Generar Orden de Trabajo';
    el = document.getElementById('ot-f-placa');       if (el) el.value = '';
    el = document.getElementById('ot-f-tipo');        if (el) el.value = '';
    el = document.getElementById('ot-f-subtipo');     if (el) el.value = '';
    el = document.getElementById('ot-f-supervisor');  if (el) el.value = '';
    el = document.getElementById('ot-f-km');          if (el) el.value = '';
    el = document.getElementById('ot-f-motivo');      if (el) el.value = '';
    el = document.getElementById('ot-f-situacion');   if (el) el.value = 'En atención';
    var now = new Date();
    el = document.getElementById('ot-f-fecha-ing');   if (el) el.value = now.toISOString().slice(0,10);
    el = document.getElementById('ot-f-hora-ing');    if (el) el.value = now.toTimeString().slice(0,5);
    otAbrirDrawer('drawer-nueva-ot');
};

window.otGuardar = function() {
    var get = function(id){ var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    var placa   = get('ot-f-placa').toUpperCase();
    var tipo    = get('ot-f-tipo');
    var subtipo = get('ot-f-subtipo');
    if (!placa)   { alert('La placa es requerida'); return; }
    if (!tipo)    { alert('Selecciona el tipo de OT'); return; }
    if (!subtipo) { alert('Selecciona el sub tipo de OT'); return; }

    var editId   = get('drawer-ot-edit-id');
    var isEdit   = !!editId;
    if (!isEdit && !window.guardAction('ot', 'c')) return;
    if (isEdit  && !window.guardAction('ot', 'e')) return;

    var otId    = document.getElementById('drawer-ot-id') ? document.getElementById('drawer-ot-id').textContent : '';
    var fechaIng = get('ot-f-fecha-ing') + 'T' + (get('ot-f-hora-ing') || '00:00') + ':00';
    var body = {
        id_ot:     isEdit ? editId : otId,
        placa:     placa,
        estado:    get('ot-f-situacion'),
        fecha_ingreso: fechaIng,
        creado_por: localStorage.getItem('fleet_correo') || '',
        detalles_json: {
            tipo_ot:    tipo,
            sub_tipo:   subtipo,
            supervisor: get('ot-f-supervisor'),
            km:         parseInt(get('ot-f-km')) || 0,
            motivo:     get('ot-f-motivo'),
            aprobacion: 'Pendiente',
            costo_total: 0
        }
    };

    var url    = isEdit ? '/api/ordenes-trabajo/' + encodeURIComponent(editId) : '/api/ordenes-trabajo';
    var method = isEdit ? 'PUT' : 'POST';

    fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function() {
            window.otCerrarTodosDrawers();
            window.otCargarTodo();
            window.mostrarAlerta(isEdit ? 'OT actualizada' : 'OT generada exitosamente', 'success');
        }).catch(function(err) { console.error(err); window.mostrarAlerta('Error al guardar la OT', 'danger'); });
};

// ── FORM Cierre OT ────────────────────────────────────────────────
window.otAbrirFormCierre = function(ticketId) {
    if (!window.guardAction('ot', 'e')) return;
    var el = document.getElementById('cierre-ot-id');
    if (el) el.textContent = ticketId;
    var now = new Date();
    var fd = document.getElementById('cierre-fecha-sal'); if (fd) fd.value = now.toISOString().slice(0,10);
    var fh = document.getElementById('cierre-hora-sal');  if (fh) fh.value = now.toTimeString().slice(0,5);
    var ft = document.getElementById('cierre-tecnico');   if (ft) ft.value = '';
    var fo = document.getElementById('cierre-obs');       if (fo) fo.value = '';
    otAbrirDrawer('drawer-cierre-ot');
    // Inicializar firma cuando el drawer está abierto
    setTimeout(window.otInicFirma, 300);
};

// Firma canvas
window._otFirma = { drawing: false, lastX: 0, lastY: 0 };
window.otInicFirma = function() {
    var canvas = document.getElementById('otFirmaCanvas');
    if (!canvas) return;
    canvas.width  = canvas.parentElement.offsetWidth || 480;
    canvas.height = 130;
    var ctx = canvas.getContext('2d');
    ctx.strokeStyle = 'var(--text, #0f172a)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    canvas.onmousedown = function(e) {
        window._otFirma.drawing = true;
        var r = canvas.getBoundingClientRect();
        window._otFirma.lastX = e.clientX - r.left;
        window._otFirma.lastY = e.clientY - r.top;
    };
    canvas.onmousemove = function(e) {
        if (!window._otFirma.drawing) return;
        var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        ctx.beginPath(); ctx.moveTo(window._otFirma.lastX, window._otFirma.lastY); ctx.lineTo(x, y); ctx.stroke();
        window._otFirma.lastX = x; window._otFirma.lastY = y;
    };
    canvas.onmouseup = canvas.onmouseleave = function() { window._otFirma.drawing = false; };
    canvas.ontouchstart = function(e) {
        e.preventDefault(); window._otFirma.drawing = true;
        var r = canvas.getBoundingClientRect(), t = e.touches[0];
        window._otFirma.lastX = t.clientX - r.left; window._otFirma.lastY = t.clientY - r.top;
    };
    canvas.ontouchmove = function(e) {
        e.preventDefault();
        if (!window._otFirma.drawing) return;
        var r = canvas.getBoundingClientRect(), t = e.touches[0], x = t.clientX - r.left, y = t.clientY - r.top;
        ctx.beginPath(); ctx.moveTo(window._otFirma.lastX, window._otFirma.lastY); ctx.lineTo(x, y); ctx.stroke();
        window._otFirma.lastX = x; window._otFirma.lastY = y;
    };
    canvas.ontouchend = function() { window._otFirma.drawing = false; };
};

window.otLimpiarFirma = function() {
    var c = document.getElementById('otFirmaCanvas');
    if (c) { var ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); }
};

window.otGuardarCierre = function() {
    if (!window.guardAction('ot', 'e')) return;
    var ticketId = document.getElementById('cierre-ot-id') ? document.getElementById('cierre-ot-id').textContent : '';
    if (!ticketId || ticketId === '—') { alert('Error: no hay OT seleccionada'); return; }
    var get = function(id){ var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    var fechaSal = get('cierre-fecha-sal') + 'T' + (get('cierre-hora-sal') || '00:00') + ':00';

    var firma = null;
    var canvas = document.getElementById('otFirmaCanvas');
    if (canvas) {
        var ctx = canvas.getContext('2d');
        var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var hasPixels = Array.from(imgData.data).some(function(v){ return v !== 0; });
        if (hasPixels) firma = canvas.toDataURL();
    }
    fetch('/api/ordenes-trabajo/' + encodeURIComponent(ticketId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            accion: 'cerrar',
            fecha_hora_salida: fechaSal,
            detalles_cierre: {
                tecnico_cierre: get('cierre-tecnico'),
                obs_cierre:     get('cierre-obs'),
                firma:          firma
            }
        })
    }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function() {
        window.otCerrarTodosDrawers();
        window.otCargarTodo();
        window.mostrarAlerta('OT cerrada exitosamente', 'success');
    }).catch(function(err) { console.error(err); window.mostrarAlerta('Error al cerrar la OT', 'danger'); });
};

// ── FORM Trabajo ──────────────────────────────────────────────────
window.otAbrirFormTrabajo = function(ticketId) {
    if (!window.guardAction('ot', 'c')) return;
    var el;
    // Poblar select de OTs aprobadas
    var sel = document.getElementById('trb-ot-select');
    if (sel) {
        sel.innerHTML = '<option value="">— Seleccionar OT Aprobada —</option>';
        window.otData.filter(function(o){ var d = otDetalles(o); return d.aprobacion === 'Aprobada'; }).forEach(function(o) {
            var opt = document.createElement('option');
            opt.value = o.ticket_entrada;
            opt.textContent = o.id_ot + ' — ' + o.placa;
            if (ticketId && o.ticket_entrada === ticketId) opt.selected = true;
            sel.appendChild(opt);
        });
    }
    var now = new Date();
    var pad2 = function(n) { return String(n).padStart(2, '0'); };
    var localDate = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
    var localTime = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    el = document.getElementById('trb-fecha-ini'); if (el) el.value = localDate;
    el = document.getElementById('trb-hora-ini');  if (el) el.value = localTime;
    el = document.getElementById('trb-fecha-fin'); if (el) el.value = '';
    el = document.getElementById('trb-hora-fin');  if (el) el.value = '';
    el = document.getElementById('trb-descripcion'); if (el) el.value = '';
    el = document.getElementById('trb-costo');     if (el) el.value = '';
    // Guardar contexto OT para garantizar asociación al guardar
    el = document.getElementById('trb-ot-context'); if (el) el.value = ticketId || '';
    // Inicializar multi-select de técnicos
    otTrbPersonalInit();
    otAbrirDrawer('drawer-nuevo-trabajo');
};

window.otGuardarTrabajo = function() {
    if (!window.guardAction('ot', 'c')) return;
    var get = function(id){ var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    var ticketId    = get('trb-ot-select') || get('trb-ot-context');
    var descripcion = get('trb-descripcion');
    var personal    = get('trb-personal');
    if (!ticketId)    { alert('Debes asociar el trabajo a una OT'); return; }
    if (!descripcion) { alert('La descripción del trabajo es requerida'); return; }

    // Combinar fecha + hora de inicio correctamente
    var fechaIniRaw = get('trb-fecha-ini');
    var fechaIni = fechaIniRaw ? fechaIniRaw + 'T' + (get('trb-hora-ini') || '00:00') + ':00' : null;
    var fechaFin = get('trb-fecha-fin') ? get('trb-fecha-fin') + 'T' + (get('trb-hora-fin') || '00:00') + ':00' : null;

    fetch('/api/ot-trabajos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ticket_visita:    ticketId,
            trabajo_realizado: descripcion,
            fecha_trabajo:    fechaIni,
            fecha_salida:     fechaFin,
            creado_por:       localStorage.getItem('fleet_correo') || '',
            detalles_json: {
                personal:  personal,
                hora_ini:  get('trb-hora-ini'),
                hora_fin:  get('trb-hora-fin'),
                costo:     parseFloat(get('trb-costo')) || 0
            }
        })
    }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function(resp) {
        var savedTicket = ticketId; // capturar antes de cerrar
        window.otCerrarTodosDrawers();
        window.mostrarAlerta('Trabajo registrado, pendiente de aprobación', 'success');
        // Recargar datos y re-abrir el detalle de la OT para mostrar el nuevo trabajo
        window.otCargarTodo(function() {
            if (savedTicket) otAbrirDetalle(savedTicket);
        });
    }).catch(function(err) { console.error(err); window.mostrarAlerta('Error al guardar trabajo', 'danger'); });
};

// ── FORM Material ─────────────────────────────────────────────────
window.otAbrirFormMaterial = function(ticketId) {
    if (!window.guardAction('ot', 'c')) return;
    var nuevoId = otGenId('MAT', window.otMatData.map(function(m){ return m.id_solicitud; }));
    var el = document.getElementById('mat-id-display'); if (el) el.textContent = nuevoId;

    var sel = document.getElementById('mat-ot-select');
    if (sel) {
        sel.innerHTML = '<option value="">— Seleccionar OT Aprobada —</option>';
        window.otData.filter(function(o){ var d = otDetalles(o); return d.aprobacion === 'Aprobada'; }).forEach(function(o) {
            var opt = document.createElement('option');
            opt.value = o.ticket_entrada;
            opt.textContent = o.id_ot + ' — ' + o.placa;
            if (ticketId && o.ticket_entrada === ticketId) opt.selected = true;
            sel.appendChild(opt);
        });
    }
    el = document.getElementById('mat-producto');   if (el) el.value = '';
    el = document.getElementById('mat-cant');       if (el) el.value = '1';
    el = document.getElementById('mat-um');         if (el) el.value = 'Pza';
    el = document.getElementById('mat-costo-unit'); if (el) el.value = '0';
    el = document.getElementById('mat-total');      if (el) el.value = '0.00';
    el = document.getElementById('mat-personal');   if (el) el.value = '';
    el = document.getElementById('mat-obs');        if (el) el.value = '';
    otAbrirDrawer('drawer-nuevo-material');
};

window.otCalcMatTotal = function() {
    var cant  = parseFloat((document.getElementById('mat-cant') || {}).value) || 0;
    var costo = parseFloat((document.getElementById('mat-costo-unit') || {}).value) || 0;
    var el = document.getElementById('mat-total');
    if (el) el.value = (cant * costo).toFixed(2);
};

window.otGuardarMaterial = function() {
    if (!window.guardAction('ot', 'c')) return;
    var get = function(id){ var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    var ticketId = get('mat-ot-select');
    var producto = get('mat-producto');
    if (!ticketId) { alert('Debes asociar la solicitud a una OT'); return; }
    if (!producto) { alert('El producto es requerido'); return; }

    var matId = document.getElementById('mat-id-display') ? document.getElementById('mat-id-display').textContent : '';
    var cant  = parseFloat(get('mat-cant')) || 1;
    var cUnit = parseFloat(get('mat-costo-unit')) || 0;

    fetch('/api/ot-materiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id_solicitud:        matId,
            ticket_ot:           ticketId,
            producto:            producto,
            cantidad:            cant,
            unidad_medida:       get('mat-um'),
            costo_unit:          cUnit,
            costo_total:         parseFloat((cant * cUnit).toFixed(2)),
            personal_solicitante: get('mat-personal'),
            observacion:         get('mat-obs'),
            estado:              'Pendiente',
            creado_por:          localStorage.getItem('fleet_correo') || ''
        })
    }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function() {
        window.otCerrarTodosDrawers();
        window.otCargarTodo();
        window.mostrarAlerta('Solicitud de material enviada', 'success');
    }).catch(function(err) { console.error(err); window.mostrarAlerta('Error al guardar solicitud', 'danger'); });
};

// ── FORM Backlog ──────────────────────────────────────────────────
window.otAbrirFormBacklog = function() {
    if (!window.guardAction('ot', 'c')) return;
    var nuevoId = otGenId('BKL', window.otBkData.map(function(b){ return b.backlog_id; }));
    var el = document.getElementById('bk-id-display'); if (el) el.textContent = nuevoId;
    var now = new Date();
    el = document.getElementById('bk-fecha');  if (el) el.value = now.toISOString().slice(0,10);
    el = document.getElementById('bk-placa');  if (el) el.value = '';
    el = document.getElementById('bk-km');     if (el) el.value = '';
    el = document.getElementById('bk-reporta');if (el) el.value = '';
    el = document.getElementById('bk-tema');   if (el) el.value = '';
    el = document.getElementById('bk-tarea');  if (el) el.value = '';
    otAbrirDrawer('drawer-nuevo-backlog');
};

window.otGuardarBacklog = function() {
    if (!window.guardAction('ot', 'c')) return;
    var get = function(id){ var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    var placa = get('bk-placa').toUpperCase();
    var tarea = get('bk-tarea');
    if (!placa) { alert('La placa es requerida'); return; }
    if (!tarea) { alert('La descripción de la tarea es requerida'); return; }
    var bkId = document.getElementById('bk-id-display') ? document.getElementById('bk-id-display').textContent : '';
    fetch('/api/ot-backlog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            backlog_id:   bkId,
            placa:        placa,
            km:           parseInt(get('bk-km')) || 0,
            tema:         get('bk-tema'),
            tarea:        tarea,
            reportado_por: get('bk-reporta'),
            fecha_reporte: get('bk-fecha'),
            estado:       'Pendiente',
            creado_por:   localStorage.getItem('fleet_correo') || ''
        })
    }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function() {
        window.otCerrarTodosDrawers();
        window.otCargarTodo();
        window.mostrarAlerta('Backlog registrado', 'success');
    }).catch(function(err) { console.error(err); window.mostrarAlerta('Error al guardar backlog', 'danger'); });
};

// ── PDF OT ────────────────────────────────────────────────────────
function otGenerarPDF(ticketId) {
    var ot = window.otData.find(function(o){ return o.ticket_entrada === ticketId; });
    if (!ot) return;
    var d = otDetalles(ot);
    var trabajos  = window.otTrbData.filter(function(t){ return t.ticket_visita === ticketId && t.estado === 'Aprobado'; });
    var materiales = window.otMatData.filter(function(m){ return m.ticket_ot === ticketId && m.estado === 'Despachado'; });
    var costo = otCalcCosto(ticketId);

    if (typeof window.jspdf === 'undefined') { alert('jsPDF no está disponible. Recarga la página.'); return; }
    var doc = new window.jspdf.jsPDF();

    doc.setFontSize(20); doc.setTextColor(88, 101, 242);
    doc.text('Orden de Trabajo: ' + ot.id_ot, 14, 22);
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text('Generada: ' + otFmtDateTime(ot.fecha_ingreso) + '  |  Estado: ' + (d.aprobacion || 'Pendiente'), 14, 30);

    doc.setFontSize(13); doc.setTextColor(30); doc.text('I. Información General', 14, 42);
    doc.setFontSize(10); doc.setTextColor(50);
    doc.text('Placa: ' + (ot.placa || 'N/A'), 14, 50);
    doc.text('Tipo OT: ' + (d.tipo_ot || '—') + ' / ' + (d.sub_tipo || '—'), 80, 50);
    doc.text('Supervisor: ' + (d.supervisor || 'N/A'), 14, 56);
    doc.text('Kilometraje: ' + (d.km || '0') + ' km', 80, 56);
    if (d.motivo) { doc.text('Motivo: ' + d.motivo, 14, 62); }

    var y = 72;
    doc.setFontSize(13); doc.setTextColor(30); doc.text('II. Trabajos Realizados (Aprobados)', 14, y);
    var trbBody = trabajos.map(function(t) {
        var td = otDetallesTrb(t);
        return [t.id_ot, t.trabajo_realizado || '—', td.personal || '—', otFmtMoney(td.costo)];
    });
    doc.autoTable({ startY: y + 4, head: [['ID', 'Descripción', 'Personal', 'Costo M.O.']], body: trbBody.length ? trbBody : [['—', 'Sin trabajos aprobados', '—', '—']], theme: 'grid', headStyles: { fillColor: [88, 101, 242] }, styles: { fontSize: 9 } });

    y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(13); doc.setTextColor(30); doc.text('III. Materiales Utilizados (Despachados)', 14, y);
    var matBody = materiales.map(function(m) {
        return [m.producto || '—', (m.cantidad || '—') + ' ' + (m.unidad_medida || ''), otFmtMoney(m.costo_unit), otFmtMoney(m.costo_total)];
    });
    doc.autoTable({ startY: y + 4, head: [['Producto', 'Cantidad', 'Costo Unit.', 'Total']], body: matBody.length ? matBody : [['—', 'Sin materiales despachados', '—', '—']], theme: 'grid', headStyles: { fillColor: [88, 101, 242] }, styles: { fontSize: 9 } });

    y = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(14); doc.setTextColor(22, 163, 74);
    doc.text('COSTO TOTAL DE LA OT: ' + otFmtMoney(costo), 14, y);

    if (d.firma) {
        y += 12; doc.setFontSize(10); doc.setTextColor(100); doc.text('Firma:', 14, y);
        doc.addImage(d.firma, 'PNG', 14, y + 4, 50, 20);
    }
    doc.save('OT_' + ot.id_ot + '.pdf');
}
