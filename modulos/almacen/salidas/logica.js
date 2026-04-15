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
    // Conductores → array global para el combobox
    fetch('/api/conductores-lista')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._salConductores = data || [];
        })
        .catch(function() {});
    // Placas → datalist + global array para lookup cliente
    fetch('/api/placas-lista')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._salPlacas = data || [];
            var dl = document.getElementById('sal-list-placas');
            if (dl) {
                dl.innerHTML = data.map(function(p) {
                    return '<option value="' + _salEsc(p.placa) + '">' + (p.cliente ? _salEsc(p.cliente) : '') + '</option>';
                }).join('');
            }
        })
        .catch(function() {});
    // set default fecha hoy
    var fechaEl = document.getElementById('sal-f-fecha');
    if (fechaEl && !fechaEl.value) fechaEl.value = new Date().toISOString().split('T')[0];
};

// ── Combobox Responsable ──────────────────────────────────────────
window._salFiltrarResp = function() {
    var q  = ((document.getElementById('sal-f-responsable-texto') || {}).value || '').toLowerCase().trim();
    var dd = document.getElementById('sal-resp-dropdown');
    if (!dd) return;
    var lista = (window._salConductores || []).filter(function(c) {
        return !q || (c.nombre || '').toLowerCase().includes(q);
    });
    if (!lista.length) { dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML = lista.map(function(c) {
        return '<div class="sal-resp-opt" ' +
            'data-id="' + c.id + '" data-nombre="' + _salEsc(c.nombre) + '" ' +
            'style="padding:7px 12px;cursor:pointer;font-size:0.875rem;" ' +
            'onmouseover="this.style.background=\'var(--hover,#f0f4ff)\'" ' +
            'onmouseout="this.style.background=\'\'" ' +
            'onmousedown="window._salSeleccionarResp(this)">' +
            _salEsc(c.nombre) +
        '</div>';
    }).join('');
};

window._salSeleccionarResp = function(el) {
    var id     = el.getAttribute('data-id');
    var nombre = el.getAttribute('data-nombre');
    var txt = document.getElementById('sal-f-responsable-texto');
    var hid = document.getElementById('sal-f-responsable-id');
    if (txt) txt.value = nombre;
    if (hid) hid.value = id || '';
    var dd = document.getElementById('sal-resp-dropdown');
    if (dd) dd.style.display = 'none';
};

window._salOcultarRespDD = function() {
    setTimeout(function() {
        var dd = document.getElementById('sal-resp-dropdown');
        if (dd) dd.style.display = 'none';
    }, 180);
};

// ── Toggle destino ────────────────────────────────────────────────
window._salToggleDestino = function() {
    var tipo = (document.getElementById('sal-f-tipo') || {}).value || '';
    var rowPlaca   = document.getElementById('sal-row-placa');
    var rowCliente = document.getElementById('sal-row-cliente');
    var esVehiculo = tipo === 'Vehiculo';
    if (rowPlaca)   rowPlaca.style.display   = esVehiculo ? '' : 'none';
    if (rowCliente) rowCliente.style.display = esVehiculo ? '' : 'none';
    if (!esVehiculo) {
        var placaEl   = document.getElementById('sal-f-placa');
        var clienteEl = document.getElementById('sal-f-cliente');
        if (placaEl)   placaEl.value   = '';
        if (clienteEl) clienteEl.value = '';
    }
};

// ── Detectar cliente al escribir/seleccionar placa ────────────────
window._salDetectarCliente = function() {
    var placa = ((document.getElementById('sal-f-placa') || {}).value || '').trim().toUpperCase();
    var clienteEl = document.getElementById('sal-f-cliente');
    if (!clienteEl) return;
    if (!placa) { clienteEl.value = ''; return; }
    var found = (window._salPlacas || []).find(function(p) { return (p.placa || '').toUpperCase() === placa; });
    clienteEl.value = found && found.cliente ? found.cliente : '';
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
    var respNombre = ((document.getElementById('sal-f-responsable-texto') || {}).value || '').trim();
    var respId     = parseInt((document.getElementById('sal-f-responsable-id') || {}).value || '') || null;
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
    var respTxt = document.getElementById('sal-f-responsable-texto');
    if (respTxt) respTxt.value = '';
    var respHid = document.getElementById('sal-f-responsable-id');
    if (respHid) respHid.value = '';
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
    var buscar  = ((document.getElementById('sal-buscar')     ||{}).value||'').toLowerCase();
    var filTipo = ((document.getElementById('sal-fil-tipo')   ||{}).value||'');
    var desde   = ((document.getElementById('sal-fil-desde')  ||{}).value||'');
    var hasta   = ((document.getElementById('sal-fil-hasta')  ||{}).value||'');
    window._salFiltrados = (window._salData||[]).filter(function(d) {
        var matchB = !buscar ||
            (d.id||'').toLowerCase().includes(buscar) ||
            (d.placa||'').toLowerCase().includes(buscar) ||
            (d.responsable||'').toLowerCase().includes(buscar);
        var matchT = !filTipo || d.tipo_destino === filTipo;
        var fecha = d.fecha ? String(d.fecha).split('T')[0] : '';
        var matchD = !desde || fecha >= desde;
        var matchH = !hasta || fecha <= hasta;
        if (desde && !hasta) { matchD = fecha === desde; matchH = true; }
        if (!desde && hasta) { matchD = true; matchH = fecha === hasta; }
        return matchB && matchT && matchD && matchH;
    });
    window._salPagActual = 1;
    window._salRender();
};

window._salLimpiarFechas = function() {
    var d = document.getElementById('sal-fil-desde');
    var h = document.getElementById('sal-fil-hasta');
    if (d) d.value = '';
    if (h) h.value = '';
    window.filtrarSalidas();
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
                '<td class="text-center">'+
                    '<button class="btn btn-xs btn-outline-secondary sal-btn-det" onclick="window._salToggleDetalle(this,\'' + _salEsc(d.id) + '\')" title="Ver artículos">'+
                        '<i class="bi bi-list-ul me-1"></i>' + nitems + ' art. <i class="bi bi-chevron-down" style="font-size:0.6rem"></i>'+
                    '</button>'+
                '</td>' +
                '<td class="text-end fw-semibold">' + totalFmt + '</td>' +
                '<td class="text-center" style="white-space:nowrap;">' +
                    '<div class="d-flex gap-1 justify-content-center">' +
                        '<button class="btn btn-xs btn-outline-secondary" onclick="window.previsualizarComprobanteSalida(\'' + _salEsc(d.id) + '\')" title="Previsualizar"><i class="bi bi-eye"></i></button>' +
                        '<button class="btn btn-xs btn-outline-primary" onclick="window.generarComprobanteSalida(\'' + _salEsc(d.id) + '\')" title="Descargar PDF"><i class="bi bi-file-earmark-pdf"></i></button>' +
                        '<button class="btn btn-xs btn-outline-danger" onclick="window.eliminarSalida(\'' + _salEsc(d.id) + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>' +
                    '</div>' +
                '</td>' +
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

window._salToggleDetalle = function(btn, id) {
    var tr = btn.closest('tr');
    var nextTr = tr.nextElementSibling;
    if (nextTr && nextTr.classList.contains('sal-detalle-row')) {
        nextTr.remove();
        var ic = btn.querySelector('.bi-chevron-up');
        if (ic) ic.classList.replace('bi-chevron-up', 'bi-chevron-down');
        return;
    }
    document.querySelectorAll('.sal-detalle-row').forEach(function(r) { r.remove(); });
    document.querySelectorAll('.sal-btn-det .bi-chevron-up').forEach(function(i) { i.classList.replace('bi-chevron-up', 'bi-chevron-down'); });

    var d = (window._salData || []).find(function(e) { return e.id === id; });
    if (!d) return;
    var items = d.items || [];

    var filas = items.map(function(it) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        var imp  = parseFloat(it.importe || cant * cu || 0);
        var mon  = d.moneda === 'USD' ? '$' : 'S/';
        return '<tr>'+
            '<td>'+ _salEsc(it.descripcion || it.inventario_id || '—') +
                (it.inventario_id ? ' <span class="badge bg-secondary fw-normal ms-1" style="font-size:0.65rem">'+ _salEsc(it.inventario_id) +'</span>' : '') +
            '</td>'+
            '<td class="text-center">'+ cant.toLocaleString('es-PE',{maximumFractionDigits:3}) +'</td>'+
            '<td class="text-end">'+ mon +' '+ cu.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:4}) +'</td>'+
            '<td class="text-end fw-semibold">'+ mon +' '+ imp.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) +'</td>'+
        '</tr>';
    }).join('');

    var detTr = document.createElement('tr');
    detTr.className = 'sal-detalle-row';
    detTr.innerHTML =
        '<td colspan="8" style="padding:0;background:var(--surface);border-top:none;">'+
            '<div style="padding:0 16px 10px 16px;">'+
                '<table class="table table-sm table-bordered mb-0 small">'+
                    '<thead><tr style="background:#7c3aed;color:#fff;">'+
                        '<th style="padding:6px 10px;">Artículo / Código</th>'+
                        '<th class="text-center" style="padding:6px 10px;width:80px">Cantidad</th>'+
                        '<th class="text-end" style="padding:6px 10px;width:120px">Costo Unit.</th>'+
                        '<th class="text-end" style="padding:6px 10px;width:110px">Importe</th>'+
                    '</tr></thead>'+
                    '<tbody>'+ (filas || '<tr><td colspan="4" class="text-center text-muted py-2">Sin artículos</td></tr>') +'</tbody>'+
                '</table>'+
            '</div>'+
        '</td>';
    tr.insertAdjacentElement('afterend', detTr);
    var ic = btn.querySelector('.bi-chevron-down');
    if (ic) ic.classList.replace('bi-chevron-down', 'bi-chevron-up');
};
function _salEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Comprobante PDF ───────────────────────────────────────────────
window.generarComprobanteSalida = function(id) {
    var d = (window._salData || []).find(function(e) { return e.id === id; });
    if (!d) { alert('No se encontró la salida ' + id); return; }

    var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
    var totalPen = parseFloat(d.total_pen || 0);
    var monSimbolo = d.moneda === 'USD' ? 'USD' : 'PEN';
    var esVehiculo = d.tipo_destino === 'Vehiculo';

    var itemsHTML = (d.items || []).map(function(it, i) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        var imp  = parseFloat(it.importe || cant * cu || 0);
        var bgRow = i % 2 === 0 ? '#f9fafb' : '#ffffff';
        return '<tr style="background:' + bgRow + '">' +
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">' + (it.descripcion || it.inventario_id || '—') + '</td>' +
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center">' + cant.toLocaleString('es-PE', {maximumFractionDigits:3}) + '</td>' +
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right">' + monSimbolo + ' ' + cu.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</td>' +
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600">' + monSimbolo + ' ' + imp.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>' +
        '</tr>';
    }).join('');

    var html = '' +
    '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#1e293b">' +

        // Encabezado
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #7c3aed">' +
            '<div>' +
                '<div style="font-size:22px;font-weight:700;color:#7c3aed;letter-spacing:-0.5px">AZKELL FLEET</div>' +
                '<div style="font-size:11px;color:#64748b;margin-top:2px">Sistema de Gestión de Flotas</div>' +
            '</div>' +
            '<div style="text-align:right">' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b">COMPROBANTE DE SALIDA</div>' +
                '<div style="font-size:13px;color:#7c3aed;font-weight:600;margin-top:4px">' + id + '</div>' +
                '<div style="font-size:11px;color:#64748b;margin-top:2px">Fecha: ' + fecha + '</div>' +
            '</div>' +
        '</div>' +

        // Datos destino
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:14px 16px;background:#f5f3ff;border-radius:8px">' +
            '<div>' +
                '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Tipo de Destino</div>' +
                '<div style="font-size:13px;font-weight:600">' + (esVehiculo ? 'Vehículo' : 'Personal') + '</div>' +
            '</div>' +
            (esVehiculo ? '<div>' +
                '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Placa</div>' +
                '<div style="font-size:13px;font-weight:700;color:#7c3aed">' + (d.placa || '—') + '</div>' +
            '</div>' : '<div></div>') +
            '<div>' +
                '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Responsable</div>' +
                '<div style="font-size:13px;font-weight:600">' + (d.responsable || '—') + '</div>' +
            '</div>' +
            '<div>' +
                '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Moneda</div>' +
                '<div style="font-size:13px;font-weight:600">' + monSimbolo + (d.moneda === 'USD' && d.tipo_cambio ? ' (T/C: ' + parseFloat(d.tipo_cambio).toFixed(3) + ')' : '') + '</div>' +
            '</div>' +
        '</div>' +

        // Tabla de artículos
        '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">' +
            '<thead>' +
                '<tr style="background:#7c3aed;color:#fff">' +
                    '<th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Artículo / Descripción</th>' +
                    '<th style="padding:9px 10px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Cantidad</th>' +
                    '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Costo Unit.</th>' +
                    '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Importe</th>' +
                '</tr>' +
            '</thead>' +
            '<tbody>' + itemsHTML + '</tbody>' +
        '</table>' +

        // Total
        '<div style="display:flex;justify-content:flex-end;margin-bottom:20px">' +
            '<div style="min-width:220px">' +
                '<div style="display:flex;justify-content:space-between;padding:6px 12px;font-size:12px;color:#64748b">' +
                    '<span>Subtotal (' + (d.items||[]).length + ' art.)</span>' +
                    '<span>' + monSimbolo + ' ' + totalPen.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;padding:10px 12px;background:#7c3aed;color:#fff;border-radius:6px;font-size:14px;font-weight:700">' +
                    '<span>TOTAL PEN</span>' +
                    '<span>S/ ' + totalPen.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span>' +
                '</div>' +
            '</div>' +
        '</div>' +

        // Observaciones
        (d.observaciones ? '<div style="padding:10px 14px;background:#fef9c3;border-radius:6px;border-left:3px solid #eab308;font-size:12px;margin-bottom:20px"><span style="font-weight:600;color:#854d0e">Observaciones: </span>' + d.observaciones + '</div>' : '') +

        // Footer
        '<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8">' +
            '<span>Generado: ' + new Date().toLocaleString('es-PE') + '</span>' +
            '<span>Azkell Fleet — Sistema de Gestión de Flotas</span>' +
        '</div>' +

    '</div>';

    var opt = {
        margin: [8, 8, 8, 8],
        filename: 'Salida_' + id + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:700px';
    document.body.appendChild(wrapper);

    html2pdf().set(opt).from(wrapper.firstChild).save().then(function() {
        document.body.removeChild(wrapper);
    });
};

// ── Previsualizar comprobante (nueva pestaña) ─────────────────────
window.previsualizarComprobanteSalida = function(id) {
    var d = (window._salData || []).find(function(e) { return e.id === id; });
    if (!d) { alert('No se encontró la salida ' + id); return; }
    var opt = { margin:[8,8,8,8], filename:'Salida_'+id+'.pdf',
        image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2,useCORS:true},
        jsPDF:{unit:'mm',format:'a4',orientation:'portrait'} };
    var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
    var totalPen = parseFloat(d.total_pen || 0);
    var monSimbolo = d.moneda === 'USD' ? 'USD' : 'PEN';
    var esVehiculo = d.tipo_destino === 'Vehiculo';
    var itemsHTML = (d.items || []).map(function(it, i) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        var imp  = parseFloat(it.importe || cant * cu || 0);
        var bgRow = i % 2 === 0 ? '#f9fafb' : '#ffffff';
        return '<tr style="background:'+bgRow+'">'+
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">'+(it.descripcion||it.inventario_id||'—')+'</td>'+
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center">'+cant.toLocaleString('es-PE',{maximumFractionDigits:3})+'</td>'+
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right">'+monSimbolo+' '+cu.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:4})+'</td>'+
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600">'+monSimbolo+' '+imp.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})+'</td>'+
        '</tr>';
    }).join('');
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:700px';
    wrapper.innerHTML = '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#1e293b">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #7c3aed">'+
            '<div><div style="font-size:22px;font-weight:700;color:#7c3aed">AZKELL FLEET</div><div style="font-size:11px;color:#64748b;margin-top:2px">Sistema de Gestión de Flotas</div></div>'+
            '<div style="text-align:right"><div style="font-size:18px;font-weight:700">COMPROBANTE DE SALIDA</div>'+
            '<div style="font-size:13px;color:#7c3aed;font-weight:600;margin-top:4px">'+id+'</div>'+
            '<div style="font-size:11px;color:#64748b;margin-top:2px">Fecha: '+fecha+'</div></div>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:14px 16px;background:#f5f3ff;border-radius:8px">'+
            '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Tipo Destino</div><div style="font-size:13px;font-weight:600">'+(esVehiculo?'Vehículo':'Personal')+'</div></div>'+
            (esVehiculo ? '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Placa</div><div style="font-size:13px;font-weight:700;color:#7c3aed">'+(d.placa||'—')+'</div></div>' : '<div></div>')+
            '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Responsable</div><div style="font-size:13px;font-weight:600">'+(d.responsable||'—')+'</div></div>'+
            '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Moneda</div><div style="font-size:13px;font-weight:600">'+monSimbolo+'</div></div>'+
        '</div>'+
        '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">'+
            '<thead><tr style="background:#7c3aed;color:#fff">'+
                '<th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase">Artículo</th>'+
                '<th style="padding:9px 10px;text-align:center;font-size:11px;text-transform:uppercase">Cantidad</th>'+
                '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase">Costo Unit.</th>'+
                '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase">Importe</th>'+
            '</tr></thead>'+
            '<tbody>'+itemsHTML+'</tbody>'+
        '</table>'+
        '<div style="display:flex;justify-content:flex-end;margin-bottom:20px">'+
            '<div style="min-width:220px">'+
                '<div style="display:flex;justify-content:space-between;padding:10px 12px;background:#7c3aed;color:#fff;border-radius:6px;font-size:14px;font-weight:700">'+
                    '<span>TOTAL PEN</span><span>S/ '+totalPen.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})+'</span>'+
                '</div>'+
            '</div>'+
        '</div>'+
        (d.observaciones ? '<div style="padding:10px 14px;background:#fef9c3;border-radius:6px;border-left:3px solid #eab308;font-size:12px"><b>Obs.: </b>'+d.observaciones+'</div>' : '')+
    '</div>';
    document.body.appendChild(wrapper);
    html2pdf().set(opt).from(wrapper.firstChild).outputPdf('bloburl').then(function(url) {
        document.body.removeChild(wrapper);
        window.open(url, '_blank');
    });
};

// ── Export Excel ──────────────────────────────────────────────────
window.exportarSalidasExcel = function() {
    var datos = window._salFiltrados || window._salData || [];
    if (!datos.length) { alert('No hay datos para exportar.'); return; }

    // Una fila por artículo (detalle completo)
    var cab = ['Código Salida','Fecha','Tipo Destino','Placa','Responsable','Moneda',
               'Código Artículo','Descripción Artículo','Cantidad','Costo Unit.','Importe','Total Salida PEN','Observaciones'];
    var filas = [];
    datos.forEach(function(d) {
        var items = d.items || [];
        if (!items.length) {
            filas.push([d.id, d.fecha?String(d.fecha).split('T')[0]:'',
                d.tipo_destino||'', d.placa||'', d.responsable||'', d.moneda||'PEN',
                '','', 0, 0, 0, parseFloat(d.total_pen||0), d.observaciones||'']);
        } else {
            items.forEach(function(it, i) {
                filas.push([
                    i===0 ? d.id : '',
                    i===0 ? (d.fecha?String(d.fecha).split('T')[0]:'') : '',
                    i===0 ? (d.tipo_destino||'') : '',
                    i===0 ? (d.placa||'') : '',
                    i===0 ? (d.responsable||'') : '',
                    d.moneda||'PEN',
                    it.inventario_id||'',
                    it.descripcion||'',
                    parseFloat(it.cantidad||0),
                    parseFloat(it.costo_unitario||0),
                    parseFloat(it.importe||0),
                    i===0 ? parseFloat(d.total_pen||0) : '',
                    i===0 ? (d.observaciones||'') : ''
                ]);
            });
        }
    });

    var ws = XLSX.utils.aoa_to_sheet([cab].concat(filas));
    ws['!cols'] = [12,12,14,10,22,8,14,28,10,12,12,14,24].map(function(w){return{wch:w};});
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salidas');
    XLSX.writeFile(wb, 'Salidas_Almacen.xlsx');
};
