// ================================================================
// MÓDULO ALMACÉN / ENTRADAS — Lógica SPA Aislada
// ================================================================

window._entData      = window._entData      || [];
window._entFiltrados = window._entFiltrados || [];
window._entPagActual = window._entPagActual || 1;
window._entTC        = window._entTC        || 3.70;
window._entItemIdx   = window._entItemIdx   || 0;
window._entInvData   = window._entInvData   || [];
var _ENT_POR_PAG = 20;

window.init_entradas = function() {
    if (!window.checkPerm('ent_inv', 'l')) {
        window.showNoPermMsg('mod-entradas');
        return;
    }
    var btnNuevo = document.querySelector('#mod-entradas .btn-primary[onclick*="abrirModalEntrada"]');
    if (btnNuevo) btnNuevo.style.display = window.checkPerm('ent_inv','c') ? '' : 'none';
    window._entPagActual = 1;
    window.cargarEntradas();
    window._entCargarProveedores();
    window._entCargarConfig();
};

window.cargarEntradas = function() {
    var tbody = document.getElementById('tbody-entradas');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
    fetch('/api/almacen/entradas')
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(data) {
            window._entData = data;
            window._entFiltrados = data;
            window.filtrarEntradas();
        })
        .catch(function(err) {
            var t = document.getElementById('tbody-entradas');
            if (t) t.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-danger">Error: '+err.message+'</td></tr>';
        });
};

window._entCargarConfig = function() {
    fetch('/api/almacen/configuracion')
        .then(function(r) { return r.json(); })
        .then(function(cfg) {
            window._entTC = parseFloat(cfg.tipo_cambio) || 3.70;
            var tcEl = document.getElementById('ent-f-tc');
            if (tcEl) tcEl.value = window._entTC.toFixed(3);
        }).catch(function() {});
};

window._entCargarProveedores = function() {
    fetch('/api/almacen/proveedores')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var items = data.map(function(p) {
                return {
                    value: p.id,
                    label: p.nombre + (p.numero_documento ? ' (' + p.numero_documento + ')' : '')
                };
            });
            window._cbInit('ent-f-proveedor', items, 'Buscar proveedor…');
        }).catch(function() {});
    var fechaEl = document.getElementById('ent-f-fecha');
    if (fechaEl && !fechaEl.value) fechaEl.value = new Date().toISOString().split('T')[0];
};

window._entActualizarTC = function() {
    var moneda = (document.getElementById('ent-f-moneda') || {}).value || 'PEN';
    var tcEl = document.getElementById('ent-f-tc');
    if (tcEl) tcEl.value = moneda === 'USD' ? window._entTC.toFixed(3) : '1.000';
    var mon = moneda === 'USD' ? '$' : 'S/';
    var el = document.getElementById('ent-total-display');
    if (el) { var old = el.textContent.replace(/^[S\$\/\s]+/,''); el.textContent = mon + ' ' + (old || '0.00'); }
};

// ── Grid items ────────────────────────────────────────────────────
window._entAgregarItem = function() {
    var tbody = document.getElementById('tbody-ent-items');
    if (!tbody) return;
    var idx = window._entItemIdx++;
    var tr = document.createElement('tr');
    tr.id = 'ent-item-' + idx;
    tr.innerHTML =
        '<td>' +
            '<input type="text" class="form-control form-control-sm ent-item-desc" list="ent-inv-list" placeholder="Buscar artículo (INV-XXXX…)" ' +
                'data-idx="'+idx+'" oninput="window._entBuscarArt(this,'+idx+')">' +
            '<datalist id="ent-inv-list"></datalist>' +
            '<input type="hidden" class="ent-item-inv-id" data-idx="'+idx+'">' +
        '</td>' +
        '<td><input type="number" class="form-control form-control-sm ent-item-cant" data-idx="'+idx+'" value="1" min="0.001" step="0.001" oninput="window._entCalcImporte('+idx+')"></td>' +
        '<td><input type="number" class="form-control form-control-sm ent-item-cu" data-idx="'+idx+'" value="0" min="0" step="0.0001" oninput="window._entCalcImporte('+idx+')"></td>' +
        '<td><input type="number" class="form-control form-control-sm ent-item-imp" data-idx="'+idx+'" value="0" readonly></td>' +
        '<td><button type="button" class="btn btn-xs btn-outline-danger" onclick="window._entQuitarItem('+idx+')"><i class="bi bi-x"></i></button></td>';
    tbody.appendChild(tr);

    if (!document.getElementById('ent-inv-list').children.length) {
        window._entCargarInv();
    }
};

window._entCargarInv = function() {
    if (window._entInvData.length) { window._entPoblarDL(); return; }
    fetch('/api/almacen/inventario')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._entInvData = data || [];
            window._entPoblarDL();
        }).catch(function() {});
};

window._entPoblarDL = function() {
    var dl = document.getElementById('ent-inv-list');
    if (dl) dl.innerHTML = window._entInvData.map(function(d) {
        return '<option value="'+_entEsc(d.id+' — '+d.descripcion)+'" data-id="'+_entEsc(d.id)+'" data-cu="'+(d.costo_referencial||0)+'">';
    }).join('');
};

window._entBuscarArt = function(input, idx) {
    var val = input.value || '';
    var invId = val.split(' — ')[0].trim();
    var item = window._entInvData.find(function(d) { return d.id === invId; });
    if (item) {
        var hiddenId = document.querySelector('.ent-item-inv-id[data-idx="'+idx+'"]');
        if (hiddenId) hiddenId.value = item.id;
        var cuEl = document.querySelector('.ent-item-cu[data-idx="'+idx+'"]');
        if (cuEl) { cuEl.value = parseFloat(item.costo_referencial||0).toFixed(2); window._entCalcImporte(idx); }
    }
};

window._entCalcImporte = function(idx) {
    var cant = parseFloat((document.querySelector('.ent-item-cant[data-idx="'+idx+'"]') || {}).value) || 0;
    var cu   = parseFloat((document.querySelector('.ent-item-cu[data-idx="'+idx+'"]')   || {}).value) || 0;
    var impEl = document.querySelector('.ent-item-imp[data-idx="'+idx+'"]');
    if (impEl) impEl.value = (cant * cu).toFixed(2);
    window._entActualizarTotal();
};

window._entQuitarItem = function(idx) {
    var tr = document.getElementById('ent-item-'+idx);
    if (tr) tr.remove();
    window._entActualizarTotal();
};

window._entActualizarTotal = function() {
    var imps = document.querySelectorAll('.ent-item-imp');
    var total = 0;
    imps.forEach(function(el) { total += parseFloat(el.value) || 0; });
    var moneda = (document.getElementById('ent-f-moneda') || {}).value === 'USD' ? '$' : 'S/';
    var el = document.getElementById('ent-total-display');
    if (el) el.textContent = moneda + ' ' + total.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2});
};

// ── Guardar ───────────────────────────────────────────────────────
window.guardarEntrada = function() {
    if (!window.guardAction('ent_inv', 'c')) return;
    var fecha      = (document.getElementById('ent-f-fecha')  || {}).value || '';
    var provId     = window._cbGet('ent-f-proveedor');
    var provNombre = window._cbGetText('ent-f-proveedor');
    var docRef = (document.getElementById('ent-f-doc-ref') || {}).value || '';
    var moneda = (document.getElementById('ent-f-moneda')  || {}).value || 'PEN';
    var tc     = parseFloat((document.getElementById('ent-f-tc') || {}).value) || 1;
    var obs    = (document.getElementById('ent-f-obs')     || {}).value || '';

    if (!fecha)  { alert('Falta la fecha.'); return; }
    if (!provId) { alert('Selecciona un proveedor.'); return; }

    var invIds = document.querySelectorAll('.ent-item-inv-id');
    var descs  = document.querySelectorAll('.ent-item-desc');
    var cants  = document.querySelectorAll('.ent-item-cant');
    var cus    = document.querySelectorAll('.ent-item-cu');
    var imps   = document.querySelectorAll('.ent-item-imp');
    var items  = [];
    for (var i = 0; i < cants.length; i++) {
        var invId = invIds[i] ? invIds[i].value : '';
        var desc  = descs[i]  ? descs[i].value  : '';
        if (!invId && !desc) continue;
        var cant = parseFloat(cants[i].value) || 0;
        var cu   = parseFloat(cus[i].value)   || 0;
        var imp  = parseFloat(imps[i].value)  || cant * cu;
        if (cant <= 0) { alert('Cantidad inválida en fila '+(i+1)); return; }
        items.push({ inventario_id: invId||null, descripcion: desc, cantidad: cant, costo_unitario: cu, moneda: moneda, importe: imp });
    }
    if (!items.length) { alert('Agrega al menos un artículo.'); return; }

    var payload = { fecha, proveedor_id: provId||null, proveedor_nombre: provNombre||null,
        documento_referencia: docRef||null, moneda, tipo_cambio: tc, observaciones: obs,
        creado_por: localStorage.getItem('fleet_user')||'', items };

    fetch('/api/almacen/entradas', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(r) {
            bootstrap.Modal.getInstance(document.getElementById('modal-entrada'))?.hide();
            alert('✅ Entrada registrada: '+r.id);
            window.cargarEntradas();
        })
        .catch(function(err) { alert('Error: '+err.message); });
};

// ── Abrir modal ───────────────────────────────────────────────────
window.abrirModalEntrada = function() {
    var tbody = document.getElementById('tbody-ent-items');
    if (tbody) tbody.innerHTML = '';
    window._entItemIdx = 0;
    var totalEl = document.getElementById('ent-total-display');
    if (totalEl) totalEl.textContent = 'S/ 0.00';

    ['ent-f-doc-ref','ent-f-obs'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
    });
    window._cbReset('ent-f-proveedor');
    var fecha = document.getElementById('ent-f-fecha');
    if (fecha) fecha.value = new Date().toISOString().split('T')[0];
    var mon = document.getElementById('ent-f-moneda');
    if (mon) mon.value = 'PEN';
    var tc = document.getElementById('ent-f-tc');
    if (tc) tc.value = window._entTC.toFixed(3);

    window._entAgregarItem();
    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-entrada'));
    modal.show();
};

// ── Eliminar ──────────────────────────────────────────────────────
window.eliminarEntrada = function(id) {
    if (!window.guardAction('ent_inv', 'd')) return;
    if (!confirm('¿Eliminar entrada '+id+'? Se eliminarán sus detalles.')) return;
    fetch('/api/almacen/entradas/'+encodeURIComponent(id), {method:'DELETE'})
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function() { window.cargarEntradas(); })
        .catch(function(err) { alert('Error: '+err.message); });
};

// ── Filtrar + Render ──────────────────────────────────────────────
window.filtrarEntradas = function() {
    var buscar  = ((document.getElementById('ent-buscar')     ||{}).value||'').toLowerCase();
    var desde   = ((document.getElementById('ent-fil-desde')  ||{}).value||'');
    var hasta   = ((document.getElementById('ent-fil-hasta')  ||{}).value||'');
    window._entFiltrados = (window._entData||[]).filter(function(d) {
        var matchB = !buscar||
            (d.id||'').toLowerCase().includes(buscar)||
            (d.proveedor_nombre||'').toLowerCase().includes(buscar)||
            (d.documento_referencia||'').toLowerCase().includes(buscar)||
            (d.creado_por||'').toLowerCase().includes(buscar)||
            (d.items||[]).some(function(it) {
                return (it.inventario_id||'').toLowerCase().includes(buscar) ||
                       (it.descripcion||'').toLowerCase().includes(buscar);
            });
        var fecha = d.fecha ? String(d.fecha).split('T')[0] : '';
        var matchD = !desde || fecha >= desde;
        var matchH = !hasta || fecha <= hasta;
        // Si solo hay una fecha: filtro exacto por ese día
        if (desde && !hasta) { matchD = fecha === desde; matchH = true; }
        if (!desde && hasta) { matchD = true; matchH = fecha === hasta; }
        return matchB && matchD && matchH;
    });
    window._entPagActual = 1;
    window._entRender();
};

window._entLimpiarFechas = function() {
    var d = document.getElementById('ent-fil-desde');
    var h = document.getElementById('ent-fil-hasta');
    if (d) d.value = '';
    if (h) h.value = '';
    window.filtrarEntradas();
};

window._entRender = function() {
    var buscar = ((document.getElementById('ent-buscar') || {}).value || '').trim();
    var modoPlano = buscar.length > 0;
    var datos = window._entFiltrados || [];
    var thead = document.querySelector('#tabla-entradas thead');

    if (modoPlano) {
        // ── Vista plana: una fila por artículo ────────────────────
        var filas = [];
        datos.forEach(function(d) {
            var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
            var items = d.items || [];
            // Si el match fue por campos de cabecera → mostrar todos los ítems
            var matchCabecera = (d.id||'').toLowerCase().includes(buscar) ||
                (d.proveedor_nombre||'').toLowerCase().includes(buscar) ||
                (d.documento_referencia||'').toLowerCase().includes(buscar) ||
                (d.creado_por||'').toLowerCase().includes(buscar);
            var itemsMostrar = matchCabecera ? items : items.filter(function(it) {
                return (it.inventario_id||'').toLowerCase().includes(buscar) ||
                       (it.descripcion||'').toLowerCase().includes(buscar);
            });
            if (!itemsMostrar.length) {
                if (matchCabecera) filas.push({ d: d, fecha: fecha, it: null });
            } else {
                itemsMostrar.forEach(function(it) { filas.push({ d: d, fecha: fecha, it: it }); });
            }
        });
        var totalFilas = filas.length;
        var totalPag = Math.max(1, Math.ceil(totalFilas / _ENT_POR_PAG));
        var pag = Math.min(window._entPagActual, totalPag);
        window._entPagActual = pag;
        var paginadas = filas.slice((pag-1)*_ENT_POR_PAG, pag*_ENT_POR_PAG);

        var cont = document.getElementById('ent-contador');
        if (cont) cont.textContent = totalFilas + ' movimiento' + (totalFilas !== 1 ? 's' : '');

        if (thead) thead.innerHTML = '<tr>' +
            '<th>Fecha / Código</th><th>Artículo</th>' +
            '<th class="text-center">Cantidad</th><th class="text-end">Costo Unit.</th>' +
            '<th class="text-end">Importe</th><th>Proveedor</th><th>Observación</th>' +
            '<th class="text-center"><i class="bi bi-three-dots-vertical"></i></th></tr>';

        var tbody = document.getElementById('tbody-entradas');
        if (!tbody) return;
        if (!paginadas.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox me-2"></i>Sin resultados</td></tr>';
        } else {
            tbody.innerHTML = paginadas.map(function(row) {
                var d = row.d; var it = row.it;
                var cant = it ? parseFloat(it.cantidad || 0) : 0;
                var cu   = it ? parseFloat(it.costo_unitario || 0) : 0;
                var imp  = it ? parseFloat(it.importe || cant * cu || 0) : 0;
                var mon  = d.moneda === 'USD' ? '$' : 'S/';
                var artTxt = it
                    ? (_entEsc(it.descripcion || it.inventario_id || '—') +
                       (it.inventario_id ? ' <span class="badge bg-secondary fw-normal ms-1" style="font-size:0.63rem">' + _entEsc(it.inventario_id) + '</span>' : ''))
                    : '<span class="text-muted small">Sin artículos</span>';
                return '<tr>' +
                    '<td><div class="small">' + _entEsc(row.fecha) + '</div>' +
                        '<span class="badge bg-secondary fw-normal" style="font-size:0.62rem">' + _entEsc(d.id||'') + '</span></td>' +
                    '<td>' + artTxt + '</td>' +
                    '<td class="text-center">' + (it ? cant.toLocaleString('es-PE',{maximumFractionDigits:3}) : '—') + '</td>' +
                    '<td class="text-end">' + (it ? mon+' '+cu.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:4}) : '—') + '</td>' +
                    '<td class="text-end fw-semibold">' + (it ? mon+' '+imp.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—') + '</td>' +
                    '<td><small>' + _entEsc(d.proveedor_nombre || '—') + '</small></td>' +
                    '<td><small class="text-muted">' + _entEsc(d.observaciones || '—') + '</small></td>' +
                    '<td class="text-center" style="white-space:nowrap;">' +
                        '<div class="d-flex gap-1 justify-content-center">' +
                            '<button class="btn btn-xs btn-outline-secondary" onclick="window.previsualizarComprobanteEntrada(\'' + _entEsc(d.id) + '\')" title="Previsualizar"><i class="bi bi-eye"></i></button>' +
                            '<button class="btn btn-xs btn-outline-primary" onclick="window.generarComprobanteEntrada(\'' + _entEsc(d.id) + '\')" title="PDF"><i class="bi bi-file-earmark-pdf"></i></button>' +
                            (window.checkPerm('ent_inv','d') ? '<button class="btn btn-xs btn-outline-danger" onclick="window.eliminarEntrada(\'' + _entEsc(d.id) + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>' : '') +
                        '</div>' +
                    '</td></tr>';
            }).join('');
        }
        var paginEl = document.getElementById('ent-paginacion');
        if (paginEl) {
            if (totalPag <= 1) { paginEl.innerHTML = ''; return; }
            paginEl.innerHTML = '<div class="d-flex align-items-center gap-1">' +
                '<button class="btn btn-xs btn-outline-secondary" ' + (pag<=1?'disabled':'') + ' onclick="window._entIrPag('+(pag-1)+')"><i class="bi bi-chevron-left"></i></button>' +
                '<span class="small text-muted mx-2">Pág. ' + pag + ' / ' + totalPag + '</span>' +
                '<button class="btn btn-xs btn-outline-secondary" ' + (pag>=totalPag?'disabled':'') + ' onclick="window._entIrPag('+(pag+1)+')"><i class="bi bi-chevron-right"></i></button>' +
                '</div>';
        }

    } else {
        // ── Vista agrupada (normal) ────────────────────────────────
        if (thead) thead.innerHTML = '<tr>' +
            '<th>Código</th><th>Fecha</th><th>Proveedor</th><th>Doc. Referencia</th>' +
            '<th>Artículos</th><th class="text-end">Total</th>' +
            '<th class="text-center"><i class="bi bi-three-dots-vertical"></i></th></tr>';

        var total = datos.length;
        var totalPag2 = Math.max(1, Math.ceil(total / _ENT_POR_PAG));
        var pag2 = Math.min(window._entPagActual, totalPag2);
        window._entPagActual = pag2;
        var pagina = datos.slice((pag2-1)*_ENT_POR_PAG, pag2*_ENT_POR_PAG);

        var cont2 = document.getElementById('ent-contador');
        if (cont2) cont2.textContent = total + ' registro' + (total !== 1 ? 's' : '');

        var tbody2 = document.getElementById('tbody-entradas');
        if (!tbody2) return;
        if (!pagina.length) {
            tbody2.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-muted"><i class="bi bi-inbox me-2"></i>Sin entradas encontradas</td></tr>';
        } else {
            tbody2.innerHTML = pagina.map(function(d) {
                var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
                var tp = parseFloat(d.total_pen||0);
                var totalFmt = 'S/ '+tp.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
                var nitems = (d.items||[]).length;
                return '<tr>'+
                    '<td><span class="badge bg-secondary fw-normal">'+_entEsc(d.id||'')+'</span></td>'+
                    '<td>'+fecha+'</td>'+
                    '<td>'+(d.proveedor_nombre?'<span class="badge bg-info-subtle text-info">'+_entEsc(d.proveedor_nombre)+'</span>':'<span class="text-muted">—</span>')+'</td>'+
                    '<td><small>'+_entEsc(d.documento_referencia||'—')+'</small></td>'+
                    '<td class="text-center">'+
                        '<button class="btn btn-xs btn-outline-secondary ent-btn-det" onclick="window._entToggleDetalle(this,\''+_entEsc(d.id)+'\')" title="Ver artículos">'+
                            '<i class="bi bi-list-ul me-1"></i>'+nitems+' art. <i class="bi bi-chevron-down" style="font-size:0.6rem"></i>'+
                        '</button>'+
                    '</td>'+
                    '<td class="text-end fw-semibold">'+totalFmt+'</td>'+
                    '<td class="text-center" style="white-space:nowrap;">'+
                        '<div class="d-flex gap-1 justify-content-center">'+
                            '<button class="btn btn-xs btn-outline-secondary" onclick="window.previsualizarComprobanteEntrada(\''+_entEsc(d.id)+'\')" title="Previsualizar"><i class="bi bi-eye"></i></button>'+
                            '<button class="btn btn-xs btn-outline-primary" onclick="window.generarComprobanteEntrada(\''+_entEsc(d.id)+'\')" title="Descargar PDF"><i class="bi bi-file-earmark-pdf"></i></button>'+
                            '<button class="btn btn-xs btn-outline-danger" onclick="window.eliminarEntrada(\''+_entEsc(d.id)+'\')" title="Eliminar"><i class="bi bi-trash"></i></button>'+
                        '</div>'+
                    '</td>'+
                '</tr>';
            }).join('');
        }
        var paginEl2 = document.getElementById('ent-paginacion');
        if (paginEl2) {
            if (totalPag2 <= 1) { paginEl2.innerHTML = ''; return; }
            paginEl2.innerHTML = '<div class="d-flex align-items-center gap-1">'+
                '<button class="btn btn-xs btn-outline-secondary" '+(pag2<=1?'disabled':'')+' onclick="window._entIrPag('+(pag2-1)+')"><i class="bi bi-chevron-left"></i></button>'+
                '<span class="small text-muted mx-2">Pág. '+pag2+' / '+totalPag2+'</span>'+
                '<button class="btn btn-xs btn-outline-secondary" '+(pag2>=totalPag2?'disabled':'')+' onclick="window._entIrPag('+(pag2+1)+')"><i class="bi bi-chevron-right"></i></button>'+
                '</div>';
        }
    }
};

window._entIrPag = function(n) { window._entPagActual = n; window._entRender(); };

window._entToggleDetalle = function(btn, id) {
    var tr = btn.closest('tr');
    var nextTr = tr.nextElementSibling;
    // Si ya está abierto, cerrar
    if (nextTr && nextTr.classList.contains('ent-detalle-row')) {
        nextTr.remove();
        var ic = btn.querySelector('.bi-chevron-up');
        if (ic) ic.classList.replace('bi-chevron-up', 'bi-chevron-down');
        return;
    }
    // Cerrar otros abiertos
    document.querySelectorAll('.ent-detalle-row').forEach(function(r) { r.remove(); });
    document.querySelectorAll('.ent-btn-det .bi-chevron-up').forEach(function(i) { i.classList.replace('bi-chevron-up', 'bi-chevron-down'); });

    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) return;
    var items = d.items || [];

    var filas = items.map(function(it) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        var imp  = parseFloat(it.importe || cant * cu || 0);
        var mon  = d.moneda === 'USD' ? '$' : 'S/';
        return '<tr>'+
            '<td>'+ _entEsc(it.descripcion || it.inventario_id || '—') +
                (it.inventario_id ? ' <span class="badge bg-secondary fw-normal ms-1" style="font-size:0.65rem">'+ _entEsc(it.inventario_id) +'</span>' : '') +
            '</td>'+
            '<td class="text-center">'+ cant.toLocaleString('es-PE',{maximumFractionDigits:3}) +'</td>'+
            '<td class="text-end">'+ mon +' '+ cu.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:4}) +'</td>'+
            '<td class="text-end fw-semibold">'+ mon +' '+ imp.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) +'</td>'+
        '</tr>';
    }).join('');

    var detTr = document.createElement('tr');
    detTr.className = 'ent-detalle-row';
    detTr.innerHTML =
        '<td colspan="7" style="padding:0;background:var(--surface);border-top:none;">'+
            '<div style="padding:0 16px 10px 16px;">'+
                '<table class="table table-sm table-bordered mb-0 small">'+
                    '<thead><tr style="background:var(--crm-accent,#2563eb);color:#fff;">'+
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
function _entEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Comprobante PDF ───────────────────────────────────────────────
window.generarComprobanteEntrada = function(id) {
    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) { alert('No se encontró la entrada ' + id); return; }

    var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
    var totalPen = parseFloat(d.total_pen || 0);
    var monSimbolo = d.moneda === 'USD' ? 'USD' : 'PEN';

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
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #2563eb">' +
            '<div>' +
                '<div style="font-size:22px;font-weight:700;color:#2563eb;letter-spacing:-0.5px">AZKELL FLEET</div>' +
                '<div style="font-size:11px;color:#64748b;margin-top:2px">Sistema de Gestión de Flotas</div>' +
            '</div>' +
            '<div style="text-align:right">' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b">COMPROBANTE DE ENTRADA</div>' +
                '<div style="font-size:13px;color:#2563eb;font-weight:600;margin-top:4px">' + id + '</div>' +
                '<div style="font-size:11px;color:#64748b;margin-top:2px">Fecha: ' + fecha + '</div>' +
            '</div>' +
        '</div>' +

        // Datos proveedor
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:14px 16px;background:#f1f5f9;border-radius:8px">' +
            '<div>' +
                '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Proveedor</div>' +
                '<div style="font-size:13px;font-weight:600">' + (d.proveedor_nombre || '—') + '</div>' +
            '</div>' +
            '<div>' +
                '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Doc. Referencia</div>' +
                '<div style="font-size:13px;font-weight:600">' + (d.documento_referencia || '—') + '</div>' +
            '</div>' +
            '<div>' +
                '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Moneda</div>' +
                '<div style="font-size:13px;font-weight:600">' + monSimbolo + (d.moneda === 'USD' && d.tipo_cambio ? ' (T/C: ' + parseFloat(d.tipo_cambio).toFixed(3) + ')' : '') + '</div>' +
            '</div>' +
            '<div>' +
                '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Registrado por</div>' +
                '<div style="font-size:13px;font-weight:600">' + (d.creado_por || '—') + '</div>' +
            '</div>' +
        '</div>' +

        // Tabla de artículos
        '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">' +
            '<thead>' +
                '<tr style="background:#2563eb;color:#fff">' +
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
                '<div style="display:flex;justify-content:space-between;padding:10px 12px;background:#2563eb;color:#fff;border-radius:6px;font-size:14px;font-weight:700">' +
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
        filename: 'Entrada_' + id + '.pdf',
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
window.previsualizarComprobanteEntrada = function(id) {
    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) { alert('No se encontró la entrada ' + id); return; }
    var opt = { margin:[8,8,8,8], filename:'Entrada_'+id+'.pdf',
        image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2,useCORS:true},
        jsPDF:{unit:'mm',format:'a4',orientation:'portrait'} };
    // Reutiliza la misma lógica de generarComprobanteEntrada pero abre en pestaña
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:700px';
    // Construir el mismo HTML del comprobante llamando a la función existente
    // Temporalmente redireccionamos .save() → .outputPdf('bloburl')
    var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
    var totalPen = parseFloat(d.total_pen || 0);
    var monSimbolo = d.moneda === 'USD' ? 'USD' : 'PEN';
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
    wrapper.innerHTML = '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#1e293b">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #2563eb">'+
            '<div><div style="font-size:22px;font-weight:700;color:#2563eb">AZKELL FLEET</div><div style="font-size:11px;color:#64748b;margin-top:2px">Sistema de Gestión de Flotas</div></div>'+
            '<div style="text-align:right"><div style="font-size:18px;font-weight:700">COMPROBANTE DE ENTRADA</div>'+
            '<div style="font-size:13px;color:#2563eb;font-weight:600;margin-top:4px">'+id+'</div>'+
            '<div style="font-size:11px;color:#64748b;margin-top:2px">Fecha: '+fecha+'</div></div>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:14px 16px;background:#f1f5f9;border-radius:8px">'+
            '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Proveedor</div><div style="font-size:13px;font-weight:600">'+(d.proveedor_nombre||'—')+'</div></div>'+
            '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Doc. Referencia</div><div style="font-size:13px;font-weight:600">'+(d.documento_referencia||'—')+'</div></div>'+
            '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Moneda</div><div style="font-size:13px;font-weight:600">'+monSimbolo+'</div></div>'+
            '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Registrado por</div><div style="font-size:13px;font-weight:600">'+(d.creado_por||'—')+'</div></div>'+
        '</div>'+
        '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">'+
            '<thead><tr style="background:#2563eb;color:#fff">'+
                '<th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase">Artículo</th>'+
                '<th style="padding:9px 10px;text-align:center;font-size:11px;text-transform:uppercase">Cantidad</th>'+
                '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase">Costo Unit.</th>'+
                '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase">Importe</th>'+
            '</tr></thead>'+
            '<tbody>'+itemsHTML+'</tbody>'+
        '</table>'+
        '<div style="display:flex;justify-content:flex-end;margin-bottom:20px">'+
            '<div style="min-width:220px">'+
                '<div style="display:flex;justify-content:space-between;padding:10px 12px;background:#2563eb;color:#fff;border-radius:6px;font-size:14px;font-weight:700">'+
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

// ── Export / Import Excel ─────────────────────────────────────────
window.exportarEntradasExcel = function() {
    var datos = window._entFiltrados || window._entData || [];
    if (!datos.length) { alert('No hay datos para exportar.'); return; }

    // Una fila por artículo (detalle completo)
    var cab = ['Código Entrada','Fecha','Proveedor','Doc. Referencia','Moneda',
               'Código Artículo','Descripción Artículo','Cantidad','Costo Unit.','Importe','Total Entrada PEN','Observaciones'];
    var filas = [];
    datos.forEach(function(d) {
        var items = d.items || [];
        if (!items.length) {
            filas.push([d.id, d.fecha?String(d.fecha).split('T')[0]:'', d.proveedor_nombre||'',
                d.documento_referencia||'', d.moneda||'PEN',
                '','', 0, 0, 0, parseFloat(d.total_pen||0), d.observaciones||'']);
        } else {
            items.forEach(function(it, i) {
                filas.push([
                    i===0 ? d.id : '',
                    i===0 ? (d.fecha?String(d.fecha).split('T')[0]:'') : '',
                    i===0 ? (d.proveedor_nombre||'') : '',
                    i===0 ? (d.documento_referencia||'') : '',
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
    ws['!cols'] = [12,12,22,18,8,14,28,10,12,12,14,24].map(function(w){return{wch:w};});
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Entradas');
    XLSX.writeFile(wb, 'Entradas_Almacen.xlsx');
};

window.descargarPlantillaEntradas = function() {
    var wsData = [
        ['fecha','proveedor_nombre','documento_referencia','inventario_id','descripcion','cantidad','costo_unitario','moneda'],
        ['2025-01-15','PROVEEDOR EJEMPLO','FACTURA F001-12345','INV-0001','FILTRO ACEITE MOTOR','5','45.00','PEN'],
        ['2025-01-15','PROVEEDOR EJEMPLO','FACTURA F001-12345','INV-0002','ACEITE MOTOR 15W40','20','12.50','PEN']
    ];
    var ws = XLSX.utils.aoa_to_sheet(wsData);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, 'Plantilla_Entradas.xlsx');
};

window.importarExcelEntradas = function(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rawJson = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rawJson.length) { alert('Archivo sin datos.'); return; }

        // Agrupar por fecha+proveedor+documento (una entrada por grupo)
        var grupos = {};
        rawJson.forEach(function(row) {
            var norm = {};
            Object.keys(row).forEach(function(k) { norm[k.toLowerCase().trim()] = row[k]; });
            var key = (norm['fecha']||'')+'|'+(norm['proveedor_nombre']||norm['proveedor']||'')+'|'+(norm['documento_referencia']||norm['doc. referencia']||'');
            if (!grupos[key]) grupos[key] = { fecha: norm['fecha']||new Date().toISOString().split('T')[0],
                proveedor_nombre: norm['proveedor_nombre']||norm['proveedor']||null,
                documento_referencia: norm['documento_referencia']||norm['doc. referencia']||null,
                moneda: (norm['moneda']||'PEN').toUpperCase(), items: [] };
            grupos[key].items.push({
                inventario_id: norm['inventario_id']||norm['codigo']||null,
                descripcion: norm['descripcion']||'',
                cantidad: parseFloat(norm['cantidad'])||0,
                costo_unitario: parseFloat(norm['costo_unitario']||norm['costo'])||0,
                moneda: (norm['moneda']||'PEN').toUpperCase(),
                importe: (parseFloat(norm['cantidad'])||0) * (parseFloat(norm['costo_unitario']||norm['costo'])||0)
            });
        });

        var entradas = Object.values(grupos).filter(function(e) { return e.items.length > 0; });
        if (!confirm('Se crearán '+entradas.length+' entradas con '+rawJson.length+' líneas totales. ¿Continuar?')) { event.target.value=''; return; }

        document.body.style.cursor='wait';
        var promises = entradas.map(function(ent) {
            return fetch('/api/almacen/entradas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ent)}).then(function(r){return r.json();});
        });
        Promise.allSettled(promises).then(function(res) {
            document.body.style.cursor='default';
            event.target.value='';
            var ok = res.filter(function(r){return r.status==='fulfilled';}).length;
            var err = res.filter(function(r){return r.status==='rejected';}).length;
            alert('✅ Importadas: '+ok+' entradas.'+(err?' ❌ Errores: '+err:''));
            window.cargarEntradas();
        });
    };
    reader.readAsArrayBuffer(file);
};
