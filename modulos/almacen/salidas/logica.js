// ================================================================
// MÓDULO ALMACÉN / SALIDAS — Lógica SPA Aislada
// ================================================================

window._salData      = window._salData      || [];
window._salFiltrados = window._salFiltrados || [];
window._salPagActual = window._salPagActual || 1;
window._salTC        = window._salTC        || 3.70;
window._salItemIdx   = window._salItemIdx   || 0;
var _SAL_POR_PAG = 20;

window.init_salidas = function() {
    window._salPagActual = 1;
    window.cargarSalidas();
    window._salCargarSelect();
    window._salCargarConfig();
};

window.cargarSalidas = function() {
    var tbody = document.getElementById('tbody-salidas');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
    fetch('/api/almacen/salidas')
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) {
            window._salData = data;
            window._salFiltrados = data;
            window.filtrarSalidas();
        })
        .catch(function(err) {
            var t = document.getElementById('tbody-salidas');
            if (t) t.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Error: ' + err.message + '</td></tr>';
        });
};

window._salCargarConfig = function() {
    fetch('/api/almacen/configuracion')
        .then(function(r) { return r.json(); })
        .then(function(cfg) {
            window._salTC = parseFloat(cfg.tipo_cambio) || 3.70;
            var tcEl = document.getElementById('sal-f-tc');
            if (tcEl) tcEl.value = window._salTC.toFixed(3);
        })
        .catch(function() {});
};

window._salCargarSelect = function() {
    // Conductores
    fetch('/api/conductores-lista')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._salConductores = data || [];
            var sel = document.getElementById('sal-f-responsable');
            if (sel) {
                sel.innerHTML = '<option value="">Seleccionar responsable…</option>' +
                    data.map(function(c) { return '<option value="' + c.id + '" data-nombre="' + _salEsc(c.nombre) + '">' + _salEsc(c.nombre) + '</option>'; }).join('');
            }
        })
        .catch(function() {});
    // Placas
    fetch('/api/placas-lista')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var sel = document.getElementById('sal-f-placa');
            if (sel) {
                sel.innerHTML = '<option value="">Seleccionar placa…</option>' +
                    data.map(function(p) { return '<option value="' + _salEsc(p.placa) + '">' + _salEsc(p.placa) + (p.cliente ? ' — ' + _salEsc(p.cliente) : '') + '</option>'; }).join('');
            }
        })
        .catch(function() {});
    // set default fecha hoy
    var fechaEl = document.getElementById('sal-f-fecha');
    if (fechaEl && !fechaEl.value) fechaEl.value = new Date().toISOString().split('T')[0];
};

// ── Toggle destino ────────────────────────────────────────────────
window._salToggleDestino = function() {
    var tipo = (document.getElementById('sal-f-tipo') || {}).value || '';
    var rowPlaca = document.getElementById('sal-row-placa');
    if (rowPlaca) rowPlaca.style.display = tipo === 'Vehiculo' ? '' : 'none';
};

window._salActualizarTC = function() {
    var moneda = (document.getElementById('sal-f-moneda') || {}).value || 'PEN';
    var tcEl = document.getElementById('sal-f-tc');
    if (tcEl) tcEl.value = moneda === 'USD' ? window._salTC.toFixed(3) : '1.000';
};

// ── Grid items ────────────────────────────────────────────────────
window._salAgregarItem = function() {
    var tbody = document.getElementById('tbody-sal-items');
    if (!tbody) return;
    var idx = window._salItemIdx++;
    var tr = document.createElement('tr');
    tr.id = 'sal-item-' + idx;
    tr.innerHTML =
        '<td>' +
            '<input type="text" class="form-control form-control-sm sal-item-desc" list="sal-inv-list" placeholder="Buscar artículo (INV-XXXX o descripción)" ' +
                'data-idx="' + idx + '" oninput="window._salBuscarArt(this,' + idx + ')">' +
            '<datalist id="sal-inv-list"></datalist>' +
            '<input type="hidden" class="sal-item-inv-id" data-idx="' + idx + '">' +
        '</td>' +
        '<td><input type="number" class="form-control form-control-sm sal-item-cant" data-idx="' + idx + '" value="1" min="0.001" step="0.001" oninput="window._salCalcItemImporte(' + idx + ')"></td>' +
        '<td><input type="number" class="form-control form-control-sm sal-item-cu" data-idx="' + idx + '" value="0" min="0" step="0.0001" oninput="window._salCalcItemImporte(' + idx + ')"></td>' +
        '<td><input type="number" class="form-control form-control-sm sal-item-imp" data-idx="' + idx + '" value="0" readonly></td>' +
        '<td><button type="button" class="btn btn-xs btn-outline-danger" onclick="window._salQuitarItem(' + idx + ')"><i class="bi bi-x"></i></button></td>';
    tbody.appendChild(tr);

    // Poblar datalist de inventario si no está
    if (!document.getElementById('sal-inv-list').children.length) {
        fetch('/api/almacen/inventario')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                window._salInvData = data || [];
                var dl = document.getElementById('sal-inv-list');
                if (dl) dl.innerHTML = data.map(function(d) {
                    return '<option value="' + _salEsc(d.id + ' — ' + d.descripcion) + '" data-id="' + _salEsc(d.id) + '" data-cu="' + (d.costo_referencial||0) + '">';
                }).join('');
            })
            .catch(function() {});
    }
};

window._salBuscarArt = function(input, idx) {
    // Cuando el usuario selecciona del datalist, autocompletar costo y id
    var val = input.value || '';
    var invIdParts = val.split(' — ');
    var invId = invIdParts[0].trim();
    var item = (window._salInvData || []).find(function(d) { return d.id === invId; });
    if (item) {
        var hiddenId = document.querySelector('.sal-item-inv-id[data-idx="' + idx + '"]');
        if (hiddenId) hiddenId.value = item.id;
        var cuEl = document.querySelector('.sal-item-cu[data-idx="' + idx + '"]');
        if (cuEl) { cuEl.value = parseFloat(item.costo_referencial||0).toFixed(4); window._salCalcItemImporte(idx); }
    }
};

window._salCalcItemImporte = function(idx) {
    var cant = parseFloat((document.querySelector('.sal-item-cant[data-idx="' + idx + '"]') || {}).value) || 0;
    var cu   = parseFloat((document.querySelector('.sal-item-cu[data-idx="' + idx + '"]')   || {}).value) || 0;
    var impEl = document.querySelector('.sal-item-imp[data-idx="' + idx + '"]');
    if (impEl) impEl.value = (cant * cu).toFixed(4);
    window._salActualizarTotal();
};

window._salQuitarItem = function(idx) {
    var tr = document.getElementById('sal-item-' + idx);
    if (tr) tr.remove();
    window._salActualizarTotal();
};

window._salActualizarTotal = function() {
    var imps = document.querySelectorAll('.sal-item-imp');
    var total = 0;
    imps.forEach(function(el) { total += parseFloat(el.value) || 0; });
    var moneda = (document.getElementById('sal-f-moneda') || {}).value === 'USD' ? '$' : 'S/';
    var el = document.getElementById('sal-total-display');
    if (el) el.textContent = moneda + ' ' + total.toLocaleString('es-PE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
};

// ── Guardar Salida ────────────────────────────────────────────────
window.guardarSalida = function() {
    var fecha      = (document.getElementById('sal-f-fecha')        || {}).value || '';
    var tipo       = (document.getElementById('sal-f-tipo')         || {}).value || '';
    var placa      = (document.getElementById('sal-f-placa')        || {}).value || null;
    var respSel    = document.getElementById('sal-f-responsable');
    var respId     = respSel ? (parseInt(respSel.value) || null) : null;
    var respNombre = respSel ? ((respSel.selectedOptions[0] || {}).getAttribute('data-nombre') || '') : '';
    var moneda     = (document.getElementById('sal-f-moneda')       || {}).value || 'PEN';
    var tc         = parseFloat((document.getElementById('sal-f-tc') || {}).value) || 1;
    var obs        = (document.getElementById('sal-f-obs')          || {}).value || '';

    if (!fecha)  { alert('Falta la fecha.'); return; }
    if (!tipo)   { alert('Selecciona el tipo de destino.'); return; }

    // Recoger items
    var invIds  = document.querySelectorAll('.sal-item-inv-id');
    var descs   = document.querySelectorAll('.sal-item-desc');
    var cants   = document.querySelectorAll('.sal-item-cant');
    var cus     = document.querySelectorAll('.sal-item-cu');
    var imps    = document.querySelectorAll('.sal-item-imp');
    var items   = [];
    for (var i = 0; i < cants.length; i++) {
        var invId = invIds[i] ? invIds[i].value : '';
        var desc  = descs[i]  ? descs[i].value  : '';
        if (!invId && !desc) continue;
        var cant = parseFloat(cants[i].value) || 0;
        var cu   = parseFloat(cus[i].value)   || 0;
        var imp  = parseFloat(imps[i].value)  || cant * cu;
        if (cant <= 0) { alert('Cantidad inválida en fila ' + (i+1)); return; }
        items.push({ inventario_id: invId || null, descripcion: desc, cantidad: cant, costo_unitario: cu, moneda: moneda, importe: imp });
    }
    if (!items.length) { alert('Agrega al menos un artículo.'); return; }

    var payload = { fecha: fecha, tipo_destino: tipo, placa: tipo === 'Vehiculo' ? placa : null,
        responsable: respNombre, responsable_id: respId, moneda: moneda, tipo_cambio: tc,
        observaciones: obs, creado_por: localStorage.getItem('fleet_user') || '', items: items };

    fetch('/api/almacen/salidas', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(r) {
            bootstrap.Modal.getInstance(document.getElementById('modal-salida'))?.hide();
            alert('✅ Salida registrada: ' + r.id);
            window.cargarSalidas();
        })
        .catch(function(err) { alert('Error al registrar: ' + err.message); });
};

// ── Abrir modal ───────────────────────────────────────────────────
window.abrirModalSalida = function() {
    // Reset items
    var tbody = document.getElementById('tbody-sal-items');
    if (tbody) tbody.innerHTML = '';
    window._salItemIdx = 0;
    var totalEl = document.getElementById('sal-total-display');
    if (totalEl) totalEl.textContent = 'S/ 0.00';

    // Reset form fields
    var fecha = document.getElementById('sal-f-fecha');
    if (fecha) fecha.value = new Date().toISOString().split('T')[0];
    var tipo = document.getElementById('sal-f-tipo');
    if (tipo) tipo.value = '';
    var placa = document.getElementById('sal-f-placa');
    if (placa) placa.value = '';
    var resp = document.getElementById('sal-f-responsable');
    if (resp) resp.value = '';
    var obs = document.getElementById('sal-f-obs');
    if (obs) obs.value = '';
    var mon = document.getElementById('sal-f-moneda');
    if (mon) mon.value = 'PEN';
    var tc = document.getElementById('sal-f-tc');
    if (tc) tc.value = window._salTC.toFixed(3);

    window._salToggleDestino();
    window._salAgregarItem(); // Agregar primera fila vacía

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-salida'));
    modal.show();
};

// ── Eliminar ──────────────────────────────────────────────────────
window.eliminarSalida = function(id) {
    if (!confirm('¿Eliminar salida ' + id + '? Esta acción eliminará el registro y sus detalles.')) return;
    fetch('/api/almacen/salidas/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function() { window.cargarSalidas(); })
        .catch(function(err) { alert('Error: ' + err.message); });
};

// ── Filtrar ───────────────────────────────────────────────────────
window.filtrarSalidas = function() {
    var buscar = ((document.getElementById('sal-buscar') || {}).value || '').toLowerCase();
    var filTipo = ((document.getElementById('sal-fil-tipo') || {}).value || '');
    var filMes  = ((document.getElementById('sal-fil-mes')  || {}).value || '');
    window._salFiltrados = (window._salData || []).filter(function(d) {
        var matchB = !buscar ||
            (d.id || '').toLowerCase().includes(buscar) ||
            (d.placa || '').toLowerCase().includes(buscar) ||
            (d.responsable || '').toLowerCase().includes(buscar);
        var matchT = !filTipo || d.tipo_destino === filTipo;
        var matchM = !filMes  || (d.fecha ? String(d.fecha).split('T')[0].substring(0,7) === filMes : false);
        return matchB && matchT && matchM;
    });
    window._salPagActual = 1;
    window._salRender();
};

// ── Render tabla ──────────────────────────────────────────────────
window._salRender = function() {
    var datos = window._salFiltrados || [];
    var total = datos.length;
    var totalPag = Math.max(1, Math.ceil(total / _SAL_POR_PAG));
    var pag = Math.min(window._salPagActual, totalPag);
    window._salPagActual = pag;
    var pagina = datos.slice((pag-1)*_SAL_POR_PAG, pag*_SAL_POR_PAG);

    var cont = document.getElementById('sal-contador');
    if (cont) cont.textContent = total + ' registro' + (total !== 1 ? 's' : '');

    var tbody = document.getElementById('tbody-salidas');
    if (!tbody) return;
    if (!pagina.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox me-2"></i>Sin salidas encontradas</td></tr>';
    } else {
        tbody.innerHTML = pagina.map(function(d) {
            var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
            var tipoBadge = d.tipo_destino === 'Vehiculo'
                ? '<span class="badge bg-primary-subtle text-primary">Vehículo</span>'
                : '<span class="badge bg-warning-subtle text-warning">Personal</span>';
            var destino = d.tipo_destino === 'Vehiculo' ? _salEsc(d.placa || '—') : '<i class="bi bi-person me-1"></i>';
            var total_pen = parseFloat(d.total_pen || 0);
            var totalFmt = 'S/ ' + total_pen.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2});
            var nitems   = (d.items || []).length;
            return '<tr>' +
                '<td><span class="badge bg-secondary fw-normal">' + _salEsc(d.id || '') + '</span></td>' +
                '<td>' + fecha + '</td>' +
                '<td>' + tipoBadge + '</td>' +
                '<td>' + destino + '</td>' +
                '<td><small>' + _salEsc(d.responsable || '—') + '</small></td>' +
                '<td class="text-center"><span class="badge bg-light text-dark border">' + nitems + ' art.</span></td>' +
                '<td class="text-end fw-semibold">' + totalFmt + '</td>' +
                '<td class="text-center"><button class="btn btn-xs btn-outline-danger" onclick="window.eliminarSalida(\'' + _salEsc(d.id) + '\')" title="Eliminar"><i class="bi bi-trash"></i></button></td>' +
            '</tr>';
        }).join('');
    }

    var paginEl = document.getElementById('sal-paginacion');
    if (paginEl) {
        if (totalPag <= 1) { paginEl.innerHTML = ''; return; }
        paginEl.innerHTML = '<div class="d-flex align-items-center gap-1">' +
            '<button class="btn btn-xs btn-outline-secondary" ' + (pag<=1?'disabled':'') + ' onclick="window._salIrPag('+(pag-1)+')"><i class="bi bi-chevron-left"></i></button>' +
            '<span class="small text-muted mx-2">Pág. ' + pag + ' / ' + totalPag + '</span>' +
            '<button class="btn btn-xs btn-outline-secondary" ' + (pag>=totalPag?'disabled':'') + ' onclick="window._salIrPag('+(pag+1)+')"><i class="bi bi-chevron-right"></i></button>' +
            '</div>';
    }
};

window._salIrPag = function(n) { window._salPagActual = n; window._salRender(); };
function _salEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Export Excel ──────────────────────────────────────────────────
window.exportarSalidasExcel = function() {
    var datos = window._salData || [];
    if (!datos.length) { alert('No hay datos para exportar.'); return; }
    var cab = ['Código','Fecha','Tipo Destino','Placa','Responsable','N° Artículos','Total PEN','Observaciones'];
    var filas = datos.map(function(d) {
        return [d.id, d.fecha ? String(d.fecha).split('T')[0] : '',
                d.tipo_destino, d.placa||'', d.responsable||'',
                (d.items||[]).length, parseFloat(d.total_pen||0), d.observaciones||''];
    });
    var ws = XLSX.utils.aoa_to_sheet([cab].concat(filas));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salidas');
    XLSX.writeFile(wb, 'Salidas_Almacen.xlsx');
};
