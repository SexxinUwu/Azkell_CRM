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
window.rotOtMaterialesActivos= window.rotOtMaterialesActivos|| [];
window.rotOtActivaId         = window.rotOtActivaId         || null;
window._rotMatIdx            = window._rotMatIdx            || 0;
window._rotInvData           = window._rotInvData           || [];

// ── Entry point ──────────────────────────────────────────────────
window.init_reportes_ot = function() {
    window.rotCargar();
};

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
        tbody.innerHTML = '<tr><td colspan="8" class="td-empty">No hay resultados con los filtros aplicados.</td></tr>';
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
        html += '<td style="font-size:0.8rem;">' + rotEscHtml(det.supervisor || ot.supervisor || '—') + '</td>';
        // Situación
        html += '<td>' + rotBadgeSituacion(det.situacion_inicial || ot.situacion) + '</td>';
        // Costo total
        html += '<td style="font-weight:700;color:#16a34a;">' + rotFmtMoney(ot.costo_total) + '</td>';
        // Fecha
        html += '<td style="font-size:0.78rem;color:var(--subtext);">' + rotFmtFecha(ot.fecha_ingreso || ot.creado_en) + '</td>';
        html += '</tr>';
    }

    tbody.innerHTML = html;
};

// ── Abrir drawer de detalle ───────────────────────────────────────
window.rotAbrirDetalle = function(idOT) {
    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
    if (!ot) return;

    window.rotDetalleId  = idOT;
    window.rotOtActivaId = idOT;
    window.rotRenderTabla(window.rotDatosFiltrados);

    var det    = rotDetalles(ot);
    var estado = ot.estado || 'Pendiente';
    var esAprobada = (estado === 'Aprobada');

    function esc(s) { return rotEscHtml(String(s||'')); }
    function fld(lbl, val) {
        return '<div class="rot-field"><span class="rot-field-lbl">' + esc(lbl) + '</span><span class="rot-field-val">' + val + '</span></div>';
    }
    function badge(e) {
        var map = { 'Pendiente':['rot-b-pendiente','Pendiente'], 'Aprobada':['rot-b-aprobada','Aprobada'], 'Cerrada':['rot-b-cerrada','Cerrada'], 'Anulado':['rot-b-anulado','Anulado'] };
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
    html += fld('Placa',      esc(ot.placa || '—'));
    html += fld('Tipo OT',    esc(det.tipo_ot   || ot.tipo      || '—'));
    html += fld('Sub Tipo',   esc(det.sub_tipo   || '—'));
    html += fld('Supervisor', esc(det.supervisor || ot.supervisor|| '—'));
    html += fld('Situación',  esc(det.situacion_inicial || ot.situacion || '—'));
    html += fld('Costo Total','<span id="rot-ot-costo-total" style="font-weight:800;color:#16a34a;">S/' + parseFloat(ot.costo_total||0).toFixed(2) + '</span>');
    html += '</div>';

    // Fechas
    html += '<div class="rot-sec"><div class="rot-sec-hd">Fechas y Tiempos</div>';
    html += fld('Fecha Creación', rotFmtFecha(ot.creado_en || ot.fecha_ingreso));
    if (det.km) html += fld('Kilometraje', esc(Number(det.km).toLocaleString('es-PE') + ' km'));
    html += '</div>';

    // Motivo
    if (det.motivo || ot.observaciones) {
        html += '<div class="rot-sec"><div class="rot-sec-hd">Motivo / Observaciones</div>';
        html += '<div style="padding:10px 12px;font-size:0.82rem;color:var(--text);">' + esc(det.motivo || ot.observaciones || '') + '</div>';
        html += '</div>';
    }

    // Trabajos (placeholder)
    html += '<div class="rot-sec" id="rot-sec-trabajos">'
          + '<div class="rot-sec-hd">Trabajos <span id="rot-tr-count" style="background:rgba(88,101,242,0.12);color:var(--primary,#5865F2);border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:4px;">…</span></div>'
          + '<div id="rot-tr-body"><div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>'
          + '</div>';

    // Salidas de Almacén (placeholder)
    html += '<div class="rot-sec" id="rot-sec-materiales">'
          + '<div class="rot-sec-hd">Salidas de Almacén <span id="rot-mat-count" style="background:rgba(88,101,242,0.12);color:var(--primary,#5865F2);border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:4px;">…</span></div>'
          + '<div id="rot-mat-body"><div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;"><div class="spinner-border spinner-border-sm text-secondary"></div></div></div>'
          + '</div>';

    // Backlog pendiente de la unidad (placeholder)
    if (ot.placa) {
        html += '<div class="rot-sec" id="rot-sec-backlog">'
              + '<div class="rot-sec-hd" style="display:flex;align-items:center;justify-content:space-between;color:#d97706;">Mantenimientos Pendientes <span id="rot-bkg-count" style="background:rgba(217,119,6,0.12);color:#d97706;border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:4px;">…</span>'
              + '<button class="btn btn-sm" style="padding:1px 8px;font-size:0.7rem;background:rgba(217,119,6,0.1);color:#d97706;font-weight:700;border-radius:12px;margin-left:auto;" onclick="event.stopPropagation();window.rotAbrirAgregarBacklog(\'' + rotEscHtml(ot.placa) + '\')"><i class="bi bi-plus"></i> Agregar</button></div>'
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
    var puedeEditar   = window.checkPerm('ot', 'e');
    var puedeEliminar = window.checkPerm('ot', 'd');
    var puedeAprobar  = puedeEditar;
    var ftHtml = (puedeEditar
        ? '<button class="btn btn-sm btn-outline-secondary" onclick="window.rotAccion(\'editar\',\'' + esc(idOT) + '\')">'
        + '<i class="bi bi-pencil me-1"></i>Editar OT</button>'
        : '')
        + (puedeEliminar
        ? '<button class="btn btn-sm btn-outline-danger" onclick="window.rotAccion(\'eliminar\',\'' + esc(idOT) + '\')">'
        + '<i class="bi bi-trash me-1"></i>Eliminar</button>'
        : '');
    if (puedeAprobar && estado !== 'Anulado' && estado !== 'Aprobada' && estado !== 'Cerrada') {
        ftHtml += '<div class="ms-auto d-flex gap-2">'
               + '<button class="btn btn-sm btn-outline-danger" onclick="window.rotAccion(\'anular\',\'' + esc(idOT) + '\')">'
               + '<i class="bi bi-x-circle me-1"></i>Anular</button>'
               + '<button class="btn btn-sm btn-success" onclick="window.rotAccion(\'aprobar\',\'' + esc(idOT) + '\')">'
               + '<i class="bi bi-check2-circle me-1"></i>Aprobar OT</button>'
               + '<button class="btn btn-sm btn-outline-secondary" onclick="window.rotAccion(\'pdf\',\'' + esc(idOT) + '\')">'
               + '<i class="bi bi-filetype-pdf me-1"></i>PDF</button></div>';
    } else {
        ftHtml += '<div class="ms-auto d-flex gap-2">'
               + (estado === 'Aprobada' ? '<button class="btn btn-sm btn-primary" onclick="window.rotAccion(\'cerrar\',\'' + esc(idOT) + '\')">'
               + '<i class="bi bi-lock-fill me-1"></i>Cerrar OT</button>' : '')
               + '<button class="btn btn-sm btn-outline-secondary" onclick="window.rotAccion(\'pdf\',\'' + esc(idOT) + '\')">'
               + '<i class="bi bi-filetype-pdf me-1"></i>PDF</button></div>';
    }
    footer.innerHTML = ftHtml;
    footer.style.display = 'flex';

    if (back) back.classList.add('open');
    drawer.classList.add('open');

    // Fetch trabajos + materiales + backlog en paralelo
    window.rotOtTrabajosActivos   = [];
    window.rotOtMaterialesActivos = [];
    Promise.all([
        fetch('/api/ot-trabajos?id_ot='       + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOT)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        ot.placa ? fetch('/api/ot-backlog?placa=' + encodeURIComponent(ot.placa) + '&estado=Pendiente').then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }) : Promise.resolve([])
    ]).then(function(res) {
        window.rotOtTrabajosActivos   = Array.isArray(res[0]) ? res[0] : [];
        window.rotOtMaterialesActivos = Array.isArray(res[1]) ? res[1] : [];
        var backlogItems              = Array.isArray(res[2]) ? res[2] : [];
        rotRenderSecTrabajos(idOT, esAprobada);
        rotRenderSecMateriales(idOT, esAprobada);
        rotRenderSecBacklog(backlogItems);
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

// ── Acciones del drawer (Editar, Eliminar, Aprobar, Cerrar, PDF) ──
window.rotAccion = function(accion, idOT) {
    var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOT); });
    if (!ot && accion !== 'pdf') return;

    if (accion === 'eliminar') {
        if (!window.guardAction('ot', 'd')) return;
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
        if (!window.guardAction('ot', 'e')) return;
        if (!confirm('¿Aprobar la OT ' + idOT + '?')) return;
        fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'aprobar' })
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
        if (!window.guardAction('ot', 'e')) return;
        if (!confirm('¿Cerrar la OT ' + idOT + '? Se marcará como Finalizada.')) return;
        fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOT), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'cerrar', detalles_cierre: {}, fecha_hora_salida: new Date().toISOString() })
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
        if (!window.guardAction('ot', 'e')) return;
        rotAbrirEditarOT(idOT);
        return;
    }

    if (accion === 'anular') {
        if (!window.guardAction('ot', 'e')) return;
        if (!confirm('¿Anular la OT ' + idOT + '?')) return;
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
    var filEst   = rotVal('rot-fil-estado');
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
window.generarPDF_OT = function(ot, trabajos, materiales) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Librería jsPDF no cargada. Recarga la página.', 'danger');
        return;
    }
    var jsPDF = window.jspdf.jsPDF;
    var doc   = new jsPDF();

    var det = {};
    try { det = typeof ot.detalles_json === 'string' ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {}); } catch(e) {}

    var idOt    = String(ot.id_ot || ot.ticket_entrada || '—');
    var placa   = ot.placa || '—';
    var estado  = ot.estado || 'Pendiente';
    var trList  = trabajos  || [];
    var matList = materiales || [];

    function fmtF(iso) {
        if (!iso) return '—';
        var s = typeof iso === 'string' ? iso.split('T')[0] : String(iso);
        var p = s.split('-'); if (p.length !== 3) return iso;
        var m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        return p[2] + ' ' + m[parseInt(p[1],10)-1] + ' ' + p[0].slice(2);
    }
    function money(v) { return 'S/' + parseFloat(v || 0).toFixed(2); }

    // ── Encabezado ──
    doc.setFontSize(22);
    doc.setTextColor(37, 99, 235);
    doc.text('Orden de Trabajo: ' + idOt, 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('Generado: ' + new Date().toLocaleString('es-PE') + '  |  Estado: ' + estado, 14, 28);

    // ── I. Información General ──
    var y = 40;
    doc.setFontSize(13);
    doc.setTextColor(30, 30, 30);
    doc.text('I. Información General', 14, y);
    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text('Placa: ' + placa,                                      14,  y);
    doc.text('Rampa: ' + (det.rampa_origen || '—'),                  80,  y);
    doc.text('Kilometraje: ' + (det.km ? det.km + ' km' : '—'),      145, y);
    y += 6;
    doc.text('Tipo OT: ' + (det.tipo_ot || '—') + (det.sub_tipo ? ' / ' + det.sub_tipo : ''), 14, y);
    doc.text('Supervisor: ' + (det.supervisor || ot.supervisor || '—'), 110, y);
    y += 6;
    doc.text('Situación Inicial: ' + (det.situacion_inicial || ot.situacion || '—'), 14, y);
    doc.text('Técnico: ' + (det.tecnico || ot.tecnico || '—'),       110, y);
    y += 6;
    doc.text('Fecha Ingreso: ' + fmtF(ot.fecha_ingreso),             14,  y);
    y += 6;
    if (det.motivo) {
        var motivoLines = doc.splitTextToSize('Motivo: ' + det.motivo, 180);
        doc.text(motivoLines, 14, y);
        y += motivoLines.length * 5;
    }

    // ── II. Cierre ──
    y += 4;
    doc.setFontSize(13);
    doc.setTextColor(30, 30, 30);
    doc.text('II. Cierre y Finalización', 14, y);
    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text('Técnico Cierre: ' + (det.tecnico || ot.tecnico || '—'), 14, y);
    y += 6;
    if (det.obs_cierre) {
        var obsLines = doc.splitTextToSize('Observaciones Finales: ' + det.obs_cierre, 180);
        doc.text(obsLines, 14, y);
        y += obsLines.length * 5;
    }

    // ── III. Trabajos ──
    y += 5;
    doc.setFontSize(13);
    doc.setTextColor(30, 30, 30);
    doc.text('III. Trabajos Realizados', 14, y);

    var trbBody = trList.length
        ? trList.map(function(t) {
            var det2 = {};
            try { det2 = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); } catch(e) {}
            return [
                t.ticket_visita || '—',
                t.trabajo_realizado || '—',
                det2.personal || t.tecnico || '—',
                t.estado || '—'
            ];
          })
        : [['—', 'Sin trabajos registrados', '—', '—']];

    doc.autoTable({
        startY: y + 4,
        head:   [['N° Trabajo', 'Descripción', 'Personal', 'Estado']],
        body:   trbBody,
        theme:  'grid',
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 9 }
    });

    // ── IV. Materiales ──
    y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.setTextColor(30, 30, 30);
    doc.text('IV. Consumos de Almacén', 14, y);

    var matBody = matList.length
        ? matList.reduce(function(acc, a) {
            var items = a.items || [];
            if (!items.length) {
                acc.push([a.id || '—', '—', '—', money(a.total_pen), a.estado || '—']);
            } else {
                items.forEach(function(it, idx) {
                    acc.push([
                        (idx === 0 ? (a.id || '') + ' | ' : '') + (it.descripcion || it.inventario_id || '—'),
                        parseFloat(it.cantidad || 0).toLocaleString('es-PE', {maximumFractionDigits: 3}),
                        money(it.costo_unitario),
                        money(it.importe),
                        idx === 0 ? (a.estado || '—') : ''
                    ]);
                });
            }
            return acc;
          }, [])
        : [['—', 'Sin consumos registrados', '—', '—', '—']];

    doc.autoTable({
        startY: y + 4,
        head:   [['Producto / Material', 'Cantidad', 'Costo Unit.', 'Total', 'Estado']],
        body:   matBody,
        theme:  'grid',
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 9 }
    });

    // ── Costo Total ──
    y = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(15);
    doc.setTextColor(22, 163, 74);
    doc.text('COSTO TOTAL DE LA OT: ' + money(ot.costo_total), 14, y);

    // ── Firma ──
    if (det.firma) {
        y += 14;
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text('Firma del Técnico/Supervisor:', 14, y);
        try { doc.addImage(det.firma, 'PNG', 14, y + 4, 50, 20); } catch(e) {}
    }

    doc.save('OT_' + idOt + '.pdf');
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
    var cerrada = lista.filter(function(o){ return o.aprobacion === 'Cerrada' || o.estado === 'Finalizado'; }).length;
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
    if (esAprobada) {
        html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);">'
              + '<button class="btn btn-sm btn-outline-primary" onclick="window.rotAgregarTrabajo(\'' + rotEscHtml(idOt) + '\')">'
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

// ── Render dinámico: sección Materiales ──────────────────────────
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
    if (esAprobada) {
        html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);">'
              + '<button class="btn btn-sm btn-outline-secondary" onclick="window.rotAgregarSalida(\'' + rotEscHtml(idOt) + '\')">'
              + '<i class="bi bi-plus-lg me-1"></i>Agregar Solicitud</button></div>';
    }
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
                rotRenderSecTrabajos(idOt, ot ? ot.estado === 'Aprobada' : false);
            }).catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar trabajo', 'danger'); });
};

// ── Eliminar Trabajo ──────────────────────────────────────────────
window.rotEliminarTrabajo = function() {
    var ticket = ((document.getElementById('rot-tr-ticket-hid') || {}).value || '').trim();
    var idOt   = ((document.getElementById('rot-tr-ot-id')      || {}).value || '');
    if (!ticket) return;
    if (!confirm('¿Eliminar el trabajo ' + ticket + '? Esta acción no se puede deshacer.')) return;

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
                rotRenderSecTrabajos(idOt, ot ? ot.estado === 'Aprobada' : false);
            }).catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar trabajo', 'danger'); });
};

// ── Agregar Salida (material) — form rico multi-artículo ──────────
window.rotAgregarSalida = function(idOt) {
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
    var items = [];
    for (var i = 0; i < cants.length; i++) {
        var desc = descs[i] ? descs[i].value.trim() : '';
        if (!desc) continue;
        var cant = parseFloat(cants[i].value) || 0;
        var cu   = parseFloat(cus[i].value)   || 0;
        var imp  = parseFloat(imps[i].value)  || cant * cu;
        if (cant <= 0) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Cantidad inválida en fila ' + (i+1), 'danger'); return; }
        items.push({ descripcion: desc, cantidad: cant, costo_unitario: cu, importe: imp });
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
                rotRenderSecMateriales(idOt, ot ? ot.estado === 'Aprobada' : false);
            }).catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar solicitud', 'danger'); });
};

// ── Eliminar Material ─────────────────────────────────────────────
window.rotEliminarMaterial = function(idSolicitud, idOt) {
    if (!confirm('¿Eliminar esta solicitud de material?')) return;
    fetch('/api/ot-materiales/' + encodeURIComponent(idSolicitud), { method: 'DELETE' })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Solicitud eliminada', 'success');
        fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOt))
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(rows) {
                window.rotOtMaterialesActivos = Array.isArray(rows) ? rows : [];
                var ot = window.rotData.find(function(o){ return String(o.ticket_entrada || o.id_ot || '') === String(idOt); });
                rotRenderSecMateriales(idOt, ot ? ot.estado === 'Aprobada' : false);
            }).catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar', 'danger'); });
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
