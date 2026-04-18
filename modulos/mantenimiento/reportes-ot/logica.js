// ================================================================
// Módulo Reportes OT — Azkell Fleet
// Patrón SPA: window.* globals, init_reportes_ot() entry point
// Muestra histórico filtrable de Órdenes de Trabajo
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.rotData          = window.rotData          || [];
window.rotDatosFiltrados= window.rotDatosFiltrados|| [];
window.rotDetalleId     = window.rotDetalleId     || null; // ticket_entrada activa en drawer

// ── Entry point ──────────────────────────────────────────────────
window.init_reportes_ot = function() {
    window.rotCargar();
};

// ── Carga desde API ──────────────────────────────────────────────
window.rotCargar = function() {
    var tbody = document.getElementById('rot-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="td-empty"><span class="spinner-border spinner-border-sm me-2"></span>Cargando...</td></tr>';

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

// ── Filtrar ──────────────────────────────────────────────────────
window.rotFiltrar = function() {
    var libre   = rotVal('rot-busqueda-libre').toLowerCase();
    var filOT   = rotVal('rot-fil-ot').toLowerCase();
    var filPlaca= rotVal('rot-fil-placa').toUpperCase();
    var filMes  = rotVal('rot-fil-mes');        // 'YYYY-MM'
    var filDesde= rotVal('rot-fil-desde');       // 'YYYY-MM-DD'
    var filHasta= rotVal('rot-fil-hasta');
    var filEst  = rotVal('rot-fil-estado');

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

// ── Render tabla ─────────────────────────────────────────────────
window.rotRenderTabla = function(lista) {
    var tbody = document.getElementById('rot-tbody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="td-empty">No hay resultados con los filtros aplicados.</td></tr>';
        return;
    }

    var html = '';
    for (var i = 0; i < lista.length; i++) {
        var ot  = lista[i];
        var det = rotDetalles(ot);
        var esActiva = (window.rotDetalleId !== null && String(window.rotDetalleId) === String(ot.ticket_entrada || ot.id_ot));
        var idOT = ot.ticket_entrada || ot.id_ot || '—';

        html += '<tr class="' + (esActiva ? 'rot-row-activa' : '') + '" onclick="window.rotAbrirDetalle(\'' + rotEscHtml(String(ot.ticket_entrada || ot.id_ot || '')) + '\')">';
        // N° OT
        html += '<td style="font-weight:800;color:var(--primary,#5865F2);">' + rotEscHtml(String(idOT)) + '</td>';
        // Placa
        html += '<td style="font-weight:700;">' + rotEscHtml(ot.placa || '—') + '</td>';
        // Tipo / Sub Tipo
        html += '<td>' + rotBadgeTipo(det.tipo_ot || ot.tipo || '') + (det.sub_tipo ? '<span style="color:var(--subtext);font-size:0.78rem;margin-left:5px;">' + rotEscHtml(det.sub_tipo) + '</span>' : '') + '</td>';
        // Supervisor
        html += '<td style="font-size:0.8rem;">' + rotEscHtml(ot.supervisor || '—') + '</td>';
        // Técnico
        html += '<td style="font-size:0.8rem;">' + rotEscHtml(ot.tecnico || '—') + '</td>';
        // Situación
        html += '<td>' + rotBadgeSituacion(ot.situacion) + '</td>';
        // Aprobación
        html += '<td>' + rotBadgeAprobacion(ot.aprobacion) + '</td>';
        // Costo total
        html += '<td style="font-weight:700;color:#16a34a;">' + rotFmtMoney(ot.costo_total) + '</td>';
        // Fecha
        html += '<td style="font-size:0.78rem;color:var(--subtext);">' + rotFmtFecha(ot.creado_en) + '</td>';
        html += '</tr>';
    }

    tbody.innerHTML = html;
};

// ── Abrir drawer de detalle ───────────────────────────────────────
window.rotAbrirDetalle = function(idOT) {
    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
    if (!ot) return;

    window.rotDetalleId = idOT;
    window.rotRenderTabla(window.rotDatosFiltrados);

    var det = rotDetalles(ot);

    var body   = document.getElementById('rot-drawer-body');
    var footer = document.getElementById('rot-drawer-footer');
    var back   = document.getElementById('rotDrawerBackdrop');
    var drawer = document.getElementById('rot-drawer-detalle');

    if (!body || !footer || !drawer) return;

    // -- Construir contenido del drawer --
    var html = '';
    // ID bar hero
    html += '<div class="rot-id-bar">';
    html += '  <div><div class="rot-id-lbl">N° Orden de Trabajo</div><div class="rot-id-num">' + rotEscHtml(String(ot.ticket_entrada || ot.id_ot || '—')) + '</div></div>';
    html += '  <div style="text-align:right;">';
    html += '    ' + rotBadgeAprobacion(ot.aprobacion);
    html += '    <div style="font-size:0.72rem;color:var(--subtext);margin-top:4px;">' + rotFmtFecha(ot.creado_en) + '</div>';
    html += '  </div>';
    html += '</div>';

    // Sección: Datos Generales
    html += '<div class="rot-sec">';
    html += '  <div class="rot-sec-hd">Datos Generales</div>';
    html += rotField('Placa', ot.placa || '—');
    html += rotField('Tipo OT', det.tipo_ot || ot.tipo || '—');
    html += rotField('Sub Tipo', det.sub_tipo || '—');
    html += rotField('Supervisor', ot.supervisor || '—');
    html += rotField('Técnico', ot.tecnico || '—');
    html += rotField('Situación', rotBadgeSituacion(ot.situacion));
    html += rotField('Aprobación', rotBadgeAprobacion(ot.aprobacion));
    html += rotField('Costo Total', '<span style="font-weight:800;color:#16a34a;">' + rotFmtMoney(ot.costo_total) + '</span>');
    html += '</div>';

    // Sección: Fechas
    html += '<div class="rot-sec">';
    html += '  <div class="rot-sec-hd">Fechas y Tiempos</div>';
    html += rotField('Fecha Creación', rotFmtFecha(ot.creado_en));
    if (det.fecha_ingreso) html += rotField('Fecha Ingreso', rotFmtFecha(det.fecha_ingreso));
    if (det.hora_ingreso)  html += rotField('Hora Ingreso', det.hora_ingreso);
    if (det.fecha_salida)  html += rotField('Fecha Salida', rotFmtFecha(det.fecha_salida));
    if (det.hora_salida)   html += rotField('Hora Salida', det.hora_salida);
    html += '</div>';

    // Sección: Motivo / Observaciones
    if (det.motivo || ot.observaciones) {
        html += '<div class="rot-sec">';
        html += '  <div class="rot-sec-hd">Motivo / Observaciones</div>';
        html += '<div style="padding:10px 12px;font-size:0.82rem;color:var(--text);">' + rotEscHtml(det.motivo || ot.observaciones || '') + '</div>';
        html += '</div>';
    }

    // Sección: Observaciones de cierre
    if (det.obs_cierre) {
        html += '<div class="rot-sec">';
        html += '  <div class="rot-sec-hd">Observaciones de Cierre</div>';
        html += '<div style="padding:10px 12px;font-size:0.82rem;color:var(--text);">' + rotEscHtml(det.obs_cierre) + '</div>';
        html += '</div>';
    }

    // Sección: Datos adicionales del JSON
    var camposExtra = Object.keys(det).filter(function(k) {
        return ['tipo_ot','sub_tipo','motivo','obs_cierre','fecha_ingreso','hora_ingreso','fecha_salida','hora_salida','rampa_origen'].indexOf(k) === -1;
    });
    if (camposExtra.length > 0) {
        html += '<div class="rot-sec">';
        html += '  <div class="rot-sec-hd">Datos Adicionales</div>';
        for (var c = 0; c < camposExtra.length; c++) {
            var clave = camposExtra[c];
            html += rotField(rotCapitalize(clave), String(det[clave] || '—'));
        }
        html += '</div>';
    }

    body.innerHTML = html;

    // -- Footer con botones según estado --
    var botonesHTML = '';
    botonesHTML += '<button class="btn btn-sm btn-outline-secondary" onclick="window.rotAccion(\'editar\',\'' + rotEscHtml(String(idOT)) + '\')">' +
                   '<i class="bi bi-pencil me-1"></i>Editar</button>';
    botonesHTML += '<button class="btn btn-sm btn-outline-danger" onclick="window.rotAccion(\'eliminar\',\'' + rotEscHtml(String(idOT)) + '\')">' +
                   '<i class="bi bi-trash me-1"></i>Eliminar</button>';

    if (ot.aprobacion === 'Pendiente') {
        botonesHTML += '<button class="btn btn-sm btn-success" onclick="window.rotAccion(\'aprobar\',\'' + rotEscHtml(String(idOT)) + '\')">' +
                       '<i class="bi bi-check-circle me-1"></i>Aprobar OT</button>';
    }
    if (ot.aprobacion === 'Aprobada') {
        botonesHTML += '<button class="btn btn-sm btn-primary" onclick="window.rotAccion(\'cerrar\',\'' + rotEscHtml(String(idOT)) + '\')">' +
                       '<i class="bi bi-lock-fill me-1"></i>Cerrar OT</button>';
    }
    botonesHTML += '<button class="btn btn-sm btn-outline-secondary ms-auto" onclick="window.rotAccion(\'pdf\',\'' + rotEscHtml(String(idOT)) + '\')">' +
                   '<i class="bi bi-filetype-pdf me-1"></i>PDF</button>';

    footer.innerHTML = botonesHTML;
    footer.style.display = 'flex';

    if (back) back.classList.add('open');
    drawer.classList.add('open');
};

// ── Cerrar drawer ─────────────────────────────────────────────────
window.rotCerrarDetalle = function() {
    var back   = document.getElementById('rotDrawerBackdrop');
    var drawer = document.getElementById('rot-drawer-detalle');
    if (back)   back.classList.remove('open');
    if (drawer) drawer.classList.remove('open');
    window.rotDetalleId = null;
    window.rotRenderTabla(window.rotDatosFiltrados);
};

// ── Acciones del drawer (Editar, Eliminar, Aprobar, Cerrar, PDF) ──
window.rotAccion = function(accion, idOT) {
    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
    if (!ot && accion !== 'pdf') return;

    if (accion === 'eliminar') {
        if (!confirm('¿Eliminar la OT ' + idOT + '? Esta acción no se puede deshacer.')) return;
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
        return;
    }

    if (accion === 'aprobar') {
        if (!confirm('¿Aprobar la OT ' + idOT + '?')) return;
        fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aprobacion: 'Aprobada' })
        })
        .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); })
        .then(function() {
            window.rotCerrarDetalle();
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT aprobada', 'success');
            window.rotCargar();
        })
        .catch(function(err) {
            console.error('Error aprobando OT:', err);
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al aprobar la OT', 'danger');
        });
        return;
    }

    if (accion === 'cerrar') {
        if (!confirm('¿Cerrar la OT ' + idOT + '? Se marcará como Cerrada.')) return;
        fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aprobacion: 'Cerrada', situacion: 'Finalizado' })
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
        return;
    }

    if (accion === 'editar') {
        // Navegar al módulo de OTs para edición, o mostrar alerta informativa
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Para editar, usa el módulo Órdenes de Trabajo.', 'info');
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

    // Usar helper global si existe
    if (typeof window.descargarExcelDinamico === 'function') {
        window.descargarExcelDinamico('rot-tabla', 'Reportes_OT');
        return;
    }

    // Fallback: exportar CSV
    var cols = ['N° OT', 'Placa', 'Tipo OT', 'Sub Tipo', 'Supervisor', 'Técnico', 'Situación', 'Aprobación', 'Costo Total', 'Fecha'];
    var filas = lista.map(function(ot) {
        var det = rotDetalles(ot);
        return [
            ot.ticket_entrada || ot.id_ot || '',
            ot.placa || '',
            det.tipo_ot || ot.tipo || '',
            det.sub_tipo || '',
            ot.supervisor || '',
            ot.tecnico || '',
            ot.situacion || '',
            ot.aprobacion || '',
            parseFloat(ot.costo_total || 0).toFixed(2),
            rotFechaISO(ot.creado_en)
        ].map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
    });

    var csv = '\uFEFF' + cols.map(function(c){ return '"' + c + '"'; }).join(',') + '\n' + filas.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'Reportes_OT_' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// ── PDF de una OT ─────────────────────────────────────────────────
function rotGenerarPDF(idOT) {
    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
    if (!ot) return;
    var det = rotDetalles(ot);

    var ventana = window.open('', '_blank');
    if (!ventana) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Permite ventanas emergentes para generar el PDF.', 'warning'); return; }

    var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
        '<title>OT ' + rotEscHtml(String(ot.ticket_entrada || ot.id_ot || '')) + '</title>' +
        '<style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:24px;} ' +
        'h2{font-size:16px;margin:0 0 4px;} .sub{color:#666;font-size:11px;margin-bottom:20px;} ' +
        'table{width:100%;border-collapse:collapse;margin-top:12px;} ' +
        'th{background:#f0f0f0;text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;} ' +
        'td{padding:6px 8px;border-bottom:1px solid #eee;} ' +
        '.footer{margin-top:30px;padding-top:10px;border-top:1px solid #ccc;font-size:10px;color:#999;}</style></head><body>';
    html += '<h2>Orden de Trabajo — Azkell Fleet</h2>';
    html += '<div class="sub">N° ' + rotEscHtml(String(ot.ticket_entrada || ot.id_ot || '—')) + ' &nbsp;|&nbsp; Generado: ' + new Date().toLocaleString('es-PE') + '</div>';
    html += '<table>';
    html += '<tr><th>Campo</th><th>Valor</th></tr>';
    html += '<tr><td>Placa</td><td>' + rotEscHtml(ot.placa || '—') + '</td></tr>';
    html += '<tr><td>Tipo OT</td><td>' + rotEscHtml(det.tipo_ot || ot.tipo || '—') + '</td></tr>';
    html += '<tr><td>Sub Tipo</td><td>' + rotEscHtml(det.sub_tipo || '—') + '</td></tr>';
    html += '<tr><td>Supervisor</td><td>' + rotEscHtml(ot.supervisor || '—') + '</td></tr>';
    html += '<tr><td>Técnico</td><td>' + rotEscHtml(ot.tecnico || '—') + '</td></tr>';
    html += '<tr><td>Situación</td><td>' + rotEscHtml(ot.situacion || '—') + '</td></tr>';
    html += '<tr><td>Aprobación</td><td>' + rotEscHtml(ot.aprobacion || '—') + '</td></tr>';
    html += '<tr><td>Costo Total</td><td>' + rotFmtMoney(ot.costo_total) + '</td></tr>';
    html += '<tr><td>Fecha</td><td>' + rotFmtFecha(ot.creado_en) + '</td></tr>';
    if (det.motivo) html += '<tr><td>Motivo</td><td>' + rotEscHtml(det.motivo) + '</td></tr>';
    if (det.obs_cierre) html += '<tr><td>Obs. Cierre</td><td>' + rotEscHtml(det.obs_cierre) + '</td></tr>';
    html += '</table>';
    html += '<div class="footer">Azkell Fleet — Documento generado automáticamente</div>';
    html += '</body></html>';

    ventana.document.write(html);
    ventana.document.close();
    ventana.focus();
    ventana.print();
}

// ── KPIs ─────────────────────────────────────────────────────────
function rotActualizarKPIs(lista) {
    var total     = lista.length;
    var pendiente = lista.filter(function(o){ return o.aprobacion === 'Pendiente'; }).length;
    var aprobada  = lista.filter(function(o){ return o.aprobacion === 'Aprobada'; }).length;
    var cerrada   = lista.filter(function(o){ return o.aprobacion === 'Cerrada'; }).length;
    var costo     = lista.reduce(function(s,o){ return s + parseFloat(o.costo_total || 0); }, 0);

    rotSetKPI('rot-kpi-total',     total);
    rotSetKPI('rot-kpi-pendiente', pendiente);
    rotSetKPI('rot-kpi-aprobada',  aprobada);
    rotSetKPI('rot-kpi-cerrada',   cerrada);
    rotSetKPI('rot-kpi-costo',    'S/' + costo.toFixed(2));
    rotSetKPI('rot-kpi-filtradas', total);
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

function rotFmtFecha(iso) {
    if (!iso) return '—';
    var s = typeof iso === 'string' ? iso.split('T')[0] : String(iso);
    var p = s.split('-');
    if (p.length !== 3) return iso;
    var meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return p[2] + ' ' + meses[parseInt(p[1],10)-1] + ' ' + p[0].slice(2);
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
