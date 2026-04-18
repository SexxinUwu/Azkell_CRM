// ================================================================
// Módulo Trabajos Anexos — Azkell Fleet
// Ruta SPA: mantenimiento/trabajos-ot
// Entry point: window.init_trabajos_ot()
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.totData      = window.totData      || [];
window.totDatosFil  = window.totDatosFil  || [];
window.totDetalleId = window.totDetalleId || null;

// ── Entry point ──────────────────────────────────────────────────
window.init_trabajos_ot = function() {
    totCargar();
};

// ── Carga de datos ────────────────────────────────────────────────
window.totCargar = function() {
    var tbody = document.getElementById('tot-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="td-placeholder"><div class="spinner-border spinner-border-sm text-secondary"></div></td></tr>';

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
    var d = new Date(iso);
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
        // Filtro estado
        if (f.estado && t.estado !== f.estado) return false;
        // Filtro N° OT
        if (f.ot && String(t.ticket_ot || '').toLowerCase().indexOf(f.ot) === -1) return false;
        // Filtro placa
        if (f.placa && String(t.placa || '').toUpperCase().indexOf(f.placa) === -1) return false;
        // Filtro mes
        if (f.mes) {
            var fechaStr = t.f_inicio ? String(t.f_inicio).split('T')[0] : '';
            if (!fechaStr.startsWith(f.mes)) return false;
        }
        // Filtro desde/hasta
        if (f.desde || f.hasta) {
            var fechaStr2 = t.f_inicio ? String(t.f_inicio).split('T')[0] : '';
            if (f.desde && fechaStr2 < f.desde) return false;
            if (f.hasta && fechaStr2 > f.hasta) return false;
        }
        // Buscador libre (personal + descripción/trabajadores)
        if (f.search) {
            var s = [t.id_trabajo, t.ticket_ot, t.trabajadores, t.placa].join(' ').toLowerCase();
            if (s.indexOf(f.search) === -1) return false;
        }
        return true;
    });

    window.totDatosFil = datos;

    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="td-placeholder"><i class="bi bi-tools" style="font-size:1.5rem; opacity:0.3"></i><br>Sin trabajos encontrados</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    datos.forEach(function(t) {
        var tr = document.createElement('tr');
        if (t.id_trabajo === window.totDetalleId) tr.classList.add('tot-row-active');
        tr.innerHTML =
            '<td><span class="fw-bold" style="color:var(--primary,#5865F2);">' + (t.id_trabajo || '—') + '</span></td>'
            + '<td><strong>' + (t.ticket_ot || '—') + '</strong></td>'
            + '<td>' + (t.trabajadores || '—') + '</td>'
            + '<td>' + totFmtDateTime(t.f_inicio) + '</td>'
            + '<td>' + totFmtDateTime(t.f_fin) + '</td>'
            + '<td><strong style="color:#16a34a;">' + totFmtMoney(t.costo) + '</strong></td>'
            + '<td>' + totBadge(t.estado) + '</td>';
        tr.onclick = (function(row) {
            return function() { totAbrirDetalle(row); };
        })(t);
        tbody.appendChild(tr);
    });
};

// ── Detalle lateral ───────────────────────────────────────────────
function totAbrirDetalle(t) {
    window.totDetalleId = t.id_trabajo;
    totRenderTabla();

    var titulo = document.getElementById('tot-detalle-titulo');
    if (titulo) titulo.textContent = 'Trabajo ' + (t.id_trabajo || '');

    var html = '';
    html += '<div style="font-size:1.3rem; font-weight:800; color:var(--text); margin-bottom:0.4rem;">' + (t.id_trabajo || '—') + '</div>';
    html += '<div style="font-size:0.83rem; color:var(--subtext); margin-bottom:1rem;">N° OT: <strong>' + (t.ticket_ot || '—') + '</strong></div>';

    html += '<div class="tot-sec">';
    html += '<div class="tot-sec-hd">Información del Trabajo</div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Estado</div><div class="tot-field-val">' + totBadge(t.estado) + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Placa</div><div class="tot-field-val"><strong>' + (t.placa || '—') + '</strong></div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Trabajador(es)</div><div class="tot-field-val" style="white-space:normal;">' + (t.trabajadores || '—') + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">F/H Inicio</div><div class="tot-field-val">' + totFmtDateTime(t.f_inicio) + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">F/H Fin</div><div class="tot-field-val">' + totFmtDateTime(t.f_fin) + '</div></div>';
    html += '<div class="tot-field"><div class="tot-field-lbl">Costo M.O.</div><div class="tot-field-val"><span style="font-size:1.05rem; color:#16a34a; font-weight:800;">' + totFmtMoney(t.costo) + '</span></div></div>';
    if (t.creado_en) {
        html += '<div class="tot-field"><div class="tot-field-lbl">Registrado</div><div class="tot-field-val" style="font-size:0.75rem;">' + totFmtDateTime(t.creado_en) + '</div></div>';
    }
    html += '</div>';

    var scroll = document.getElementById('tot-detalle-scroll');
    if (scroll) scroll.innerHTML = html;

    var footer = document.getElementById('tot-detalle-footer');
    if (footer) {
        footer.style.display = 'flex';
        if (t.estado === 'Pendiente') {
            footer.innerHTML = '<button class="btn btn-sm btn-success flex-fill fw-bold" onclick="window.totAprobar(' + JSON.stringify(t.id_trabajo) + ')"><i class="bi bi-check-lg me-1"></i>Aprobar Costo Trabajo</button>';
        } else {
            footer.innerHTML = '<span style="font-size:0.8rem; color:var(--subtext); padding:4px;">Trabajo ya aprobado</span>';
        }
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

// ── Aprobar trabajo ───────────────────────────────────────────────
window.totAprobar = function(idTrabajo) {
    if (!confirm('¿Aprobar el costo de este trabajo? Esta acción no se puede deshacer.')) return;

    fetch('/api/ot-trabajos/' + encodeURIComponent(idTrabajo), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            accion: 'aprobar',
            usuario: localStorage.getItem('fleet_correo') || ''
        })
    })
    .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Trabajo aprobado exitosamente', 'success');
        }
        window.totDetalleId = null;
        var panel = document.getElementById('tot-panel-detalle');
        if (panel) panel.classList.remove('open');
        totCargar();
    })
    .catch(function(err) {
        console.error('Error aprobando trabajo:', err);
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Error al aprobar el trabajo', 'danger');
        }
    });
};

// ── Exportar a Excel ──────────────────────────────────────────────
window.totExportar = function() {
    var datos = window.totDatosFil.length > 0 ? window.totDatosFil : window.totData;
    if (datos.length === 0) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('No hay datos para exportar', 'warning');
        }
        return;
    }

    // Generar tabla temporal para descargarExcelDinamico si está disponible
    if (typeof window.descargarExcelDinamico === 'function') {
        // Construir tabla temporal
        var tmpId = 'tot-export-tmp';
        var existing = document.getElementById(tmpId);
        if (existing) existing.remove();

        var tbl = document.createElement('table');
        tbl.id = tmpId;
        tbl.style.display = 'none';
        var thead = '<thead><tr><th>ID Trabajo</th><th>N° OT</th><th>Placa</th><th>Trabajador(es)</th><th>F/H Inicio</th><th>F/H Fin</th><th>Costo</th><th>Estado</th></tr></thead>';
        var tbody = '<tbody>' + datos.map(function(t) {
            return '<tr>'
                + '<td>' + (t.id_trabajo || '') + '</td>'
                + '<td>' + (t.ticket_ot || '') + '</td>'
                + '<td>' + (t.placa || '') + '</td>'
                + '<td>' + (t.trabajadores || '') + '</td>'
                + '<td>' + totFmtDateTime(t.f_inicio) + '</td>'
                + '<td>' + totFmtDateTime(t.f_fin) + '</td>'
                + '<td>' + totFmtMoney(t.costo) + '</td>'
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
    var rows = [['ID Trabajo','N° OT','Placa','Trabajador(es)','F/H Inicio','F/H Fin','Costo','Estado']];
    datos.forEach(function(t) {
        rows.push([
            t.id_trabajo || '',
            t.ticket_ot || '',
            t.placa || '',
            t.trabajadores || '',
            totFmtDateTime(t.f_inicio),
            totFmtDateTime(t.f_fin),
            totFmtMoney(t.costo),
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
