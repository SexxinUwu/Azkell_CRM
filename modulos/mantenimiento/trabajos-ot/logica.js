// ================================================================
// Módulo Trabajos Anexos — Azkell Fleet
// Ruta SPA: mantenimiento/trabajos-ot
// Entry point: window.init_trabajos_ot()
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.totData      = window.totData      || [];
window.totDatosFil  = window.totDatosFil  || [];
window.totDetalleId = window.totDetalleId || null;

// ID único del trabajo: usa id_ot (nuevo schema) o ticket_visita como fallback para registros viejos
function totGetId(t) {
    return (String(t.id_ot || '').trim()) || (String(t.ticket_visita || '').trim()) || '';
}

// ── Entry point ──────────────────────────────────────────────────
window.init_trabajos_ot = function() {
    totCargar();
    totPoblarPersonal();
};

// ── Carga de datos ────────────────────────────────────────────────
window.totCargar = function() {
    var tbody = document.getElementById('tot-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="td-placeholder"><div class="spinner-border spinner-border-sm text-secondary"></div></td></tr>';

    fetch('/api/ot-trabajos')
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function(data) {
            window.totData = Array.isArray(data) ? data : [];
            totRenderTabla();
        })
        .catch(function(err) {
            console.error('Error cargando trabajos OT:', err);
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('Error al cargar trabajos de OT', 'danger');
            }
            var tb = document.getElementById('tot-tbody');
            if (tb) tb.innerHTML = '<tr><td colspan="7" class="td-placeholder">Error al cargar datos</td></tr>';
        });
};

// ── Helpers ───────────────────────────────────────────────────────
function totFmtMoney(val) {
    return 'S/.' + parseFloat(val || 0).toFixed(2);
}

function totFmtDateTime(iso) {
    if (!iso) return '—';
    // Tratar como hora local: reemplazar 'Z' o añadir offset cero para evitar conversión UTC
    var s = String(iso).replace('Z', '').replace('+00:00', '');
    // Si el string no tiene 'T', MySQL lo devuelve como 'YYYY-MM-DD HH:MM:SS' — reemplazar espacio por T
    if (s.indexOf('T') === -1) s = s.replace(' ', 'T');
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(iso).split('T')[0] || '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' })
        + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function totFmtFecha(iso) {
    if (!iso) return '—';
    var s = typeof iso === 'string' ? iso.split('T')[0] : String(iso);
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' });
}

function totBadge(estado) {
    if (estado === 'Aprobado') {
        return '<span class="tot-badge badge-aprobado">Aprobado</span>';
    }
    return '<span class="tot-badge badge-pendiente">Pendiente</span>';
}

function totParseDetalles(t) {
    try { return typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); }
    catch(e) { return {}; }
}

function totEsc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Filtrar ───────────────────────────────────────────────────────
window.totFiltrar = function() {
    totRenderTabla();
};

function totGetFiltros() {
    return {
        search: ((document.getElementById('tot-search') || {}).value || '').toLowerCase().trim(),
        ot:     ((document.getElementById('tot-fil-ot') || {}).value || '').trim().toLowerCase(),
        placa:  ((document.getElementById('tot-fil-placa') || {}).value || '').trim().toUpperCase(),
        mes:    ((document.getElementById('tot-fil-mes') || {}).value || '').trim(),
        desde:  ((document.getElementById('tot-fil-desde') || {}).value || '').trim(),
        hasta:  ((document.getElementById('tot-fil-hasta') || {}).value || '').trim(),
        estado: ((document.getElementById('tot-fil-estado') || {}).value || '').trim()
    };
}

// ── Render tabla ──────────────────────────────────────────────────
window.totRenderTabla = function() {
    var tbody = document.getElementById('tot-tbody');
    if (!tbody) return;

    var f = totGetFiltros();

    var datos = window.totData.filter(function(t) {
        var det = totParseDetalles(t);
        // Filtro estado
        if (f.estado && t.estado !== f.estado) return false;
        // Filtro N° OT
        if (f.ot && String(t.id_ot || '').toLowerCase().indexOf(f.ot) === -1) return false;
        // Filtro placa
        if (f.placa && String(t.placa || '').toUpperCase().indexOf(f.placa) === -1) return false;
        // Filtro mes
        if (f.mes) {
            var fechaStr = t.fecha_trabajo ? String(t.fecha_trabajo).split('T')[0] : '';
            if (!fechaStr.startsWith(f.mes)) return false;
        }
        // Filtro desde/hasta
        if (f.desde || f.hasta) {
            var fechaStr2 = t.fecha_trabajo ? String(t.fecha_trabajo).split('T')[0] : '';
            if (f.desde && fechaStr2 < f.desde) return false;
            if (f.hasta && fechaStr2 > f.hasta) return false;
        }
        // Buscador libre
        if (f.search) {
            var s = [t.ticket_visita, t.id_ot, det.personal || t.tecnico, t.placa, t.trabajo_realizado].join(' ').toLowerCase();
            if (s.indexOf(f.search) === -1) return false;
        }
        return true;
    });

    window.totDatosFil = datos;

    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="td-placeholder"><i class="bi bi-tools" style="font-size:1.5rem; opacity:0.3"></i><br>Sin trabajos encontrados</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    datos.forEach(function(t) {
        var det = totParseDetalles(t);
        // Calcular horas de trabajo
        var tiempoHrs = '—';
        if (t.fecha_trabajo && t.fecha_salida) {
            var tIni = new Date(t.fecha_trabajo).getTime();
            var tFin = new Date(t.fecha_salida).getTime();
            if (!isNaN(tIni) && !isNaN(tFin) && tFin > tIni) {
                var hrs = (tFin - tIni) / 3600000;
                tiempoHrs = hrs.toFixed(1) + ' h';
            }
        }
        var tr = document.createElement('tr');
        if (totGetId(t) === window.totDetalleId) tr.classList.add('tot-row-active');
        tr.innerHTML =
            '<td><span class="fw-bold" style="color:var(--primary,#5865F2);">' + totEsc(totGetId(t) || '—') + '</span></td>'
            + '<td><strong>' + totEsc(t.ot_id || '—') + '</strong></td>'
            + '<td style="font-size:0.79rem;">' + totFmtDateTime(t.fecha_trabajo) + '</td>'
            + '<td style="max-width:200px;white-space:normal;font-size:0.81rem;">' + totEsc(t.trabajo_realizado || '—') + '</td>'
            + '<td>' + totEsc(det.personal || t.tecnico || '—') + '</td>'
            + '<td style="font-size:0.79rem;">' + totFmtDateTime(t.fecha_salida) + '</td>'
            + '<td><strong style="color:#16a34a;">' + totFmtMoney(det.costo) + '</strong></td>'
            + '<td style="font-size:0.82rem;">' + totEsc(tiempoHrs) + '</td>';
        tr.onclick = (function(row) {
            return function() { totAbrirDetalle(row); };
        })(t);
        tbody.appendChild(tr);
    });
};

// ── Detalle lateral ───────────────────────────────────────────────
function totAbrirDetalle(t) {
    window.totDetalleId = totGetId(t);
    totRenderTabla();

    var det = totParseDetalles(t);
    var idDisplay = totGetId(t);

    var titulo = document.getElementById('tot-detalle-titulo');
    if (titulo) titulo.textContent = 'Trabajo ' + idDisplay;

    var html = '';
    html += '<div style="font-size:1.3rem; font-weight:800; color:var(--text); margin-bottom:0.4rem;">' + totEsc(idDisplay || '—') + '</div>';
    html += '<div style="font-size:0.83rem; color:var(--subtext); margin-bottom:1rem;">N° OT: <strong>' + totEsc(t.ot_id || '—') + '</strong></div>';

    html += '<div class="tot-sec">';
    html += '<div class="tot-sec-hd">Información del Trabajo</div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Estado</div><div class="tot-field-val">' + totBadge(t.estado) + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Placa</div><div class="tot-field-val"><strong>' + totEsc(t.placa || '—') + '</strong></div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Trabajador(es)</div><div class="tot-field-val" style="white-space:normal;">' + totEsc(det.personal || t.tecnico || '—') + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Descripción</div><div class="tot-field-val" style="white-space:normal;">' + totEsc(t.trabajo_realizado || '—') + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">F/H Inicio</div><div class="tot-field-val">' + totFmtDateTime(t.fecha_trabajo) + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">F/H Fin</div><div class="tot-field-val">' + totFmtDateTime(t.fecha_salida) + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Costo M.O.</div><div class="tot-field-val"><span style="font-size:1.05rem; color:#16a34a; font-weight:800;">' + totFmtMoney(det.costo) + '</span></div></div>';
    if (t.creado_en) {
        html += '<div class="tot-field"><div class="tot-field-lbl">Registrado</div><div class="tot-field-val" style="font-size:0.75rem;">' + totFmtDateTime(t.creado_en) + '</div></div>';
    }
    html += '</div>';

    var scroll = document.getElementById('tot-detalle-scroll');
    if (scroll) scroll.innerHTML = html;

    var footer = document.getElementById('tot-detalle-footer');
    if (footer) {
        footer.style.display = 'flex';
        footer.innerHTML =
            '<button class="btn btn-sm btn-primary flex-fill fw-bold" onclick="window.totAbrirEditar(\'' + idDisplay + '\')"><i class="bi bi-pencil me-1"></i>Editar Trabajo</button>'
            + '<button class="btn btn-sm btn-danger ms-2" style="min-width:38px;" onclick="window.totEliminar(\'' + idDisplay + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>';
    }

    var panel = document.getElementById('tot-panel-detalle');
    if (panel) panel.classList.add('open');
}

window.totCerrarDetalle = function() {
    var panel = document.getElementById('tot-panel-detalle');
    if (panel) panel.classList.remove('open');
    window.totDetalleId = null;
    totRenderTabla();
};

// ── Eliminar trabajo ──────────────────────────────────────────────
window.totEliminar = function(ticket) {
    if (!confirm('¿Eliminar el trabajo ' + ticket + '? Esta acción no se puede deshacer.')) return;
    fetch('/api/ot-trabajos/' + encodeURIComponent(ticket), { method: 'DELETE' })
        .then(function(r) {
            if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'HTTP ' + r.status); });
            return r.json();
        })
        .then(function() {
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('Trabajo eliminado correctamente', 'success');
            }
            window.totDetalleId = null;
            var panel = document.getElementById('tot-panel-detalle');
            if (panel) panel.classList.remove('open');
            totCargar();
        })
        .catch(function(err) {
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('Error al eliminar: ' + err.message, 'danger');
            }
        });
};

// ── Abrir drawer edición ──────────────────────────────────────────
window.totAbrirEditar = function(ticket) {
    var t = window.totData.find(function(x) { return totGetId(x) === String(ticket); });
    if (!t) return;
    var det = totParseDetalles(t);

    var toLocalDT = function(iso) {
        if (!iso) return '';
        var s = String(iso).replace('Z', '').replace('+00:00', '');
        if (s.indexOf('T') === -1) s = s.replace(' ', 'T');
        return s.slice(0, 16); // YYYY-MM-DDTHH:MM para datetime-local
    };

    var set = function(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
    set('tot-ed-ticket',    ticket);
    set('tot-ed-desc',      t.trabajo_realizado || '');
    set('tot-ed-costo',     det.costo !== undefined ? det.costo : '0');
    set('tot-ed-fecha-ini', toLocalDT(t.fecha_trabajo));
    set('tot-ed-fecha-fin', toLocalDT(t.fecha_salida));

    var estEl = document.getElementById('tot-ed-estado');
    if (estEl) estEl.value = t.estado || 'Pendiente';

    var persEl = document.getElementById('tot-ed-personal');
    if (persEl) persEl.value = det.personal || t.tecnico || '';

    var tit = document.getElementById('tot-ed-titulo');
    if (tit) tit.textContent = 'Editar ' + ticket;

    var drawer = document.getElementById('tot-drawer-editar');
    if (drawer) drawer.classList.add('open');

    totPoblarPersonal();
};

window.totCerrarDrawerEditar = function() {
    var drawer = document.getElementById('tot-drawer-editar');
    if (drawer) drawer.classList.remove('open');
};

// ── Guardar edición ───────────────────────────────────────────────
window.totGuardarEdicion = function() {
    var ticket = ((document.getElementById('tot-ed-ticket')    || {}).value || '').trim();
    var desc   = ((document.getElementById('tot-ed-desc')      || {}).value || '').trim();
    var pers   = ((document.getElementById('tot-ed-personal')  || {}).value || '').trim();
    var fIni   = ((document.getElementById('tot-ed-fecha-ini') || {}).value || '');
    var fFin   = ((document.getElementById('tot-ed-fecha-fin') || {}).value || '');
    var costo  = parseFloat((document.getElementById('tot-ed-costo')   || {}).value || 0);
    var estado = ((document.getElementById('tot-ed-estado')    || {}).value || 'Pendiente');

    if (!ticket) return;
    if (!desc) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La descripción es requerida', 'danger'); return; }

    fetch('/api/ot-trabajos/' + encodeURIComponent(ticket), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            accion: 'editar',
            trabajo_realizado: desc,
            fecha_trabajo: fIni || null,
            fecha_salida:  fFin || null,
            personal:      pers,
            costo:         costo,
            estado:        estado
        })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        window.totCerrarDrawerEditar();
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Trabajo actualizado correctamente', 'success');
        }
        window.totDetalleId = null;
        var panel = document.getElementById('tot-panel-detalle');
        if (panel) panel.classList.remove('open');
        totCargar();
    })
    .catch(function(err) {
        console.error('Error editando trabajo:', err);
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Error al guardar los cambios', 'danger');
        }
    });
};

// ── Poblar select Personal ────────────────────────────────────────
function totPoblarPersonal() {
    var el = document.getElementById('tot-ed-personal');
    var savedVal = el ? el.value : '';
    fetch('/api/conductores')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            var lista = Array.isArray(data) ? data : (data.data || []);
            var opts = lista.map(function(p) {
                var n = (p.nombre_completo || p.nombre || '').trim();
                // Normalizar a Title Case independientemente de cómo esté en la DB
                n = n.split(' ').map(function(w) {
                    return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '';
                }).join(' ');
                return n ? '<option value="' + n + '">' + n + '</option>' : '';
            }).join('');
            var elNow = document.getElementById('tot-ed-personal');
            if (elNow) {
                elNow.innerHTML = '<option value="">— Seleccionar técnico —</option>' + opts;
                if (savedVal) elNow.value = savedVal;
            }
        })
        .catch(function() {});
}

// ── Exportar a Excel ──────────────────────────────────────────────
window.totExportar = function() {
    var datos = window.totDatosFil.length > 0 ? window.totDatosFil : window.totData;
    if (datos.length === 0) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('No hay datos para exportar', 'warning');
        }
        return;
    }

    if (typeof window.descargarExcelDinamico === 'function') {
        var tmpId = 'tot-export-tmp';
        var existing = document.getElementById(tmpId);
        if (existing) existing.remove();

        var tbl = document.createElement('table');
        tbl.id = tmpId;
        tbl.style.display = 'none';
        var thead = '<thead><tr><th>ID Trabajo</th><th>N° OT</th><th>Placa</th><th>Trabajador(es)</th><th>Descripción</th><th>F/H Inicio</th><th>F/H Fin</th><th>Costo</th><th>Estado</th></tr></thead>';
        var tbody = '<tbody>' + datos.map(function(t) {
            var det = totParseDetalles(t);
            return '<tr>'
                + '<td>' + (t.ticket_visita || '') + '</td>'
                + '<td>' + (t.id_ot || '') + '</td>'
                + '<td>' + (t.placa || '') + '</td>'
                + '<td>' + (det.personal || t.tecnico || '') + '</td>'
                + '<td>' + (t.trabajo_realizado || '') + '</td>'
                + '<td>' + totFmtDateTime(t.fecha_trabajo) + '</td>'
                + '<td>' + totFmtDateTime(t.fecha_salida) + '</td>'
                + '<td>' + totFmtMoney(det.costo) + '</td>'
                + '<td>' + (t.estado || '') + '</td>'
                + '</tr>';
        }).join('') + '</tbody>';
        tbl.innerHTML = thead + tbody;
        document.body.appendChild(tbl);
        window.descargarExcelDinamico(tmpId, 'Trabajos_OT');
        setTimeout(function() { var el = document.getElementById(tmpId); if (el) el.remove(); }, 1000);
        return;
    }

    // Fallback CSV
    var rows = [['ID Trabajo','N° OT','Placa','Trabajador(es)','Descripción','F/H Inicio','F/H Fin','Costo','Estado']];
    datos.forEach(function(t) {
        var det = totParseDetalles(t);
        rows.push([
            t.ticket_visita || '',
            t.id_ot || '',
            t.placa || '',
            det.personal || t.tecnico || '',
            t.trabajo_realizado || '',
            totFmtDateTime(t.fecha_trabajo),
            totFmtDateTime(t.fecha_salida),
            totFmtMoney(det.costo),
            t.estado || ''
        ]);
    });
    var csv = rows.map(function(r) { return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'Trabajos_OT.csv'; a.click();
    URL.revokeObjectURL(url);
};
