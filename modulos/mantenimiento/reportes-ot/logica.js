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

// ── Entry point ──────────────────────────────────────────────────
window.init_reportes_ot = function() {
    window.rotCargar();
    rotPoblarPersonal();
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
    html += fld('Aprobación', badge(estado));
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
              + '<div class="rot-sec-hd" style="color:#d97706;">Backlog Pendiente de la Unidad <span id="rot-bkg-count" style="background:rgba(217,119,6,0.12);color:#d97706;border-radius:9px;padding:1px 7px;font-size:0.68rem;font-weight:800;margin-left:4px;">…</span></div>'
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
    var permisos = {};
    try { permisos = JSON.parse(localStorage.getItem('fleet_permisos') || '{}'); } catch(ex) {}
    var puedeAprobar = permisos.admin === true || !!(permisos.ot && permisos.ot.aprobar);
    var ftHtml = '<button class="btn btn-sm btn-outline-secondary" onclick="window.rotAccion(\'editar\',\'' + esc(idOT) + '\')">'
               + '<i class="bi bi-pencil me-1"></i>Editar OT</button>'
               + '<button class="btn btn-sm btn-outline-danger" onclick="window.rotAccion(\'eliminar\',\'' + esc(idOT) + '\')">'
               + '<i class="bi bi-trash me-1"></i>Eliminar</button>';
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
            .reduce(function(s, m){ return s + parseFloat(m.costo_total || 0); }, 0);
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
        rotAbrirEditarOT(idOT);
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
        ? matList.map(function(a) {
            return [
                a.producto || '—',
                (a.cantidad || '0') + ' ' + (a.unidad_medida || ''),
                money(a.costo_unit),
                money(a.costo_total),
                a.estado || '—'
            ];
          })
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
        .reduce(function(s, m) { return s + parseFloat(m.costo_total || 0); }, 0);
    var hayPendientes = lista.some(function(m) { return m.estado !== 'Despachado'; });

    var html = '';
    if (esAprobada) {
        html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);">'
              + '<button class="btn btn-sm btn-outline-secondary" onclick="window.rotAgregarSalida(\'' + rotEscHtml(idOt) + '\')">'
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
                  + '<div><span style="font-weight:700;color:var(--text);">' + rotEscHtml(m.producto || '—') + '</span> ' + badge + '</div>'
                  + '<button class="btn btn-sm" style="color:var(--subtext);padding:0 4px;" onclick="event.stopPropagation();window.rotEliminarMaterial(' + m.id + ',\'' + rotEscHtml(idOt) + '\')" title="Eliminar"><i class="bi bi-trash" style="font-size:0.75rem;"></i></button>'
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

// ── Agregar Trabajo ───────────────────────────────────────────────
window.rotAgregarTrabajo = function(idOt) {
    var lbl  = document.getElementById('rot-tr-ot-lbl');      if (lbl)  lbl.textContent = idOt;
    var hid  = document.getElementById('rot-tr-ot-id');        if (hid)  hid.value = idOt;
    var hid2 = document.getElementById('rot-tr-ticket-hid');   if (hid2) hid2.value = '';
    var desc = document.getElementById('rot-tr-desc');         if (desc) desc.value = '';
    var pers = document.getElementById('rot-tr-personal');     if (pers) pers.value = '';
    var cos  = document.getElementById('rot-tr-costo');        if (cos)  cos.value  = '0';
    var est  = document.getElementById('rot-tr-estado');       if (est)  est.value  = 'Pendiente';
    var hoy  = new Date();
    var localDT = hoy.getFullYear() + '-' +
        String(hoy.getMonth()+1).padStart(2,'0') + '-' +
        String(hoy.getDate()).padStart(2,'0') + 'T' +
        String(hoy.getHours()).padStart(2,'0') + ':' +
        String(hoy.getMinutes()).padStart(2,'0');
    var fi = document.getElementById('rot-tr-fecha-ini'); if (fi) fi.value = localDT;
    var ff = document.getElementById('rot-tr-fecha-fin'); if (ff) ff.value = '';
    var tit = document.getElementById('rot-tr-drawer-titulo'); if (tit) tit.textContent = 'Agregar Trabajo';
    rotAbrirSubDrawer('rot-drawer-trabajo');
    rotPoblarPersonal();
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
    var pers = document.getElementById('rot-tr-personal');     if (pers) pers.value = det2.personal || t.tecnico || '';
    var cos  = document.getElementById('rot-tr-costo');        if (cos)  cos.value  = det2.costo !== undefined ? det2.costo : '0';
    var est  = document.getElementById('rot-tr-estado');       if (est)  est.value  = t.estado || 'Pendiente';

    var toLocalDT = function(iso) {
        if (!iso) return '';
        var s = String(iso);
        return s.indexOf('T') !== -1 ? s.slice(0,16) : s.slice(0,16);
    };
    var fi = document.getElementById('rot-tr-fecha-ini'); if (fi) fi.value = toLocalDT(t.fecha_trabajo || '');
    var ff = document.getElementById('rot-tr-fecha-fin'); if (ff) ff.value = toLocalDT(t.fecha_salida  || '');
    var tit = document.getElementById('rot-tr-drawer-titulo'); if (tit) tit.textContent = 'Editar Trabajo ' + ticket;
    rotAbrirSubDrawer('rot-drawer-trabajo');
    rotPoblarPersonal();
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
    var estado = ((document.getElementById('rot-tr-estado')     || {}).value || 'Pendiente');

    if (!desc) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La descripción es requerida', 'danger'); return; }

    var esEdicion = !!ticket;
    var user = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';

    var url, method, payload;
    if (esEdicion) {
        url     = '/api/ot-trabajos/' + encodeURIComponent(ticket);
        method  = 'PUT';
        payload = { accion: 'editar', trabajo_realizado: desc, fecha_trabajo: fIni || null, fecha_salida: fFin || null, personal: pers, costo: costo, estado: estado };
    } else {
        url     = '/api/ot-trabajos';
        method  = 'POST';
        payload = { id_ot: idOt, trabajo_realizado: desc, fecha_trabajo: fIni || null, fecha_salida: fFin || null, creado_por: user, detalles_json: JSON.stringify({ personal: pers, costo: costo }) };
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

// ── Agregar Salida (material) ─────────────────────────────────────
window.rotAgregarSalida = function(idOt) {
    var lbl = document.getElementById('rot-mat-ot-lbl'); if (lbl) lbl.textContent = idOt;
    var hid = document.getElementById('rot-mat-ot-id');  if (hid) hid.value = idOt;
    ['rot-mat-producto','rot-mat-solicitante','rot-mat-obs'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
    });
    var cant = document.getElementById('rot-mat-cant');        if (cant) cant.value = '1';
    var cu   = document.getElementById('rot-mat-costo-unit');  if (cu)   cu.value   = '0';
    var ct   = document.getElementById('rot-mat-costo-total'); if (ct)   ct.value   = '0';
    var um   = document.getElementById('rot-mat-um');          if (um)   um.value   = 'Pza';
    rotAbrirSubDrawer('rot-drawer-material');
};

window.rotCalcTotal = function() {
    var cant = parseFloat((document.getElementById('rot-mat-cant')       || {}).value || 0);
    var cu   = parseFloat((document.getElementById('rot-mat-costo-unit') || {}).value || 0);
    var ct   = document.getElementById('rot-mat-costo-total');
    if (ct) ct.value = (cant * cu).toFixed(2);
};

// ── Guardar Material ──────────────────────────────────────────────
window.rotGuardarMaterial = function() {
    var idOt  = ((document.getElementById('rot-mat-ot-id')          || {}).value || '');
    var prod  = ((document.getElementById('rot-mat-producto')        || {}).value || '').trim();
    var cant  = parseFloat((document.getElementById('rot-mat-cant')  || {}).value || 1);
    var um    = ((document.getElementById('rot-mat-um')              || {}).value || 'Pza');
    var cu    = parseFloat((document.getElementById('rot-mat-costo-unit')  || {}).value || 0);
    var ct    = parseFloat((document.getElementById('rot-mat-costo-total') || {}).value || 0);
    var solic = ((document.getElementById('rot-mat-solicitante')     || {}).value || '').trim();
    var obs   = ((document.getElementById('rot-mat-obs')             || {}).value || '').trim();

    if (!prod) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('El producto es requerido', 'danger'); return; }

    var user = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
    fetch('/api/ot-materiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_ot: idOt, producto: prod, cantidad: cant, unidad_medida: um, costo_unit: cu, costo_total: ct, personal_solicitante: solic, observacion: obs, estado: 'Pendiente', creado_por: user })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(d) {
        window.rotCerrarSubDrawer('rot-drawer-material');
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Solicitud ' + (d.id_solicitud || '') + ' registrada', 'success');
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
    fetch('/api/ot-materiales/' + idSolicitud, { method: 'DELETE' })
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

// ── Poblar selects de Personal ────────────────────────────────────
function rotPoblarPersonal() {
    fetch('/api/conductores')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            var lista = Array.isArray(data) ? data : (data.data || []);
            var opts = lista.map(function(p) {
                var n = (p.nombre_completo || p.nombre || '').trim();
                return n ? '<option value="' + n + '">' + n + '</option>' : '';
            }).join('');
            var el = document.getElementById('rot-tr-personal');
            if (el) el.innerHTML = '<option value="">— Seleccionar técnico —</option>' + opts;
        })
        .catch(function() {});
}

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
              + '<button class="btn btn-sm" style="padding:1px 7px;font-size:0.7rem;background:rgba(22,163,74,0.1);color:#16a34a;font-weight:700;border-radius:12px;" '
              + 'onclick="event.stopPropagation();window.rotMarcarBacklogRealizado(' + b.id + ',this)" title="Marcar como Realizado">✓ Realizado</button>'
              + '</div>'
              + '<div style="color:var(--text);margin-top:3px;">' + rotEscHtml(b.tarea || '—') + '</div>'
              + (b.reportado_por ? '<div style="font-size:0.73rem;color:var(--subtext);margin-top:2px;"><i class="bi bi-person me-1"></i>' + rotEscHtml(b.reportado_por) + '</div>' : '')
              + '</div>';
    });
    body.innerHTML = html;
}

// ── Marcar backlog item como Realizado ────────────────────────────
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
        // Quitar el ítem del DOM
        if (btn) {
            var row = btn.closest ? btn.closest('[style]') : btn.parentNode.parentNode;
            if (row && row.parentNode) row.parentNode.removeChild(row);
            // Actualizar contador
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
