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
        if (cuEl) { cuEl.value = parseFloat(item.costo_referencial||0).toFixed(4); window._entCalcImporte(idx); }
    }
};

window._entCalcImporte = function(idx) {
    var cant = parseFloat((document.querySelector('.ent-item-cant[data-idx="'+idx+'"]') || {}).value) || 0;
    var cu   = parseFloat((document.querySelector('.ent-item-cu[data-idx="'+idx+'"]')   || {}).value) || 0;
    var impEl = document.querySelector('.ent-item-imp[data-idx="'+idx+'"]');
    if (impEl) impEl.value = (cant * cu).toFixed(4);
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
    if (!confirm('¿Eliminar entrada '+id+'? Se eliminarán sus detalles.')) return;
    fetch('/api/almacen/entradas/'+encodeURIComponent(id), {method:'DELETE'})
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function() { window.cargarEntradas(); })
        .catch(function(err) { alert('Error: '+err.message); });
};

// ── Filtrar + Render ──────────────────────────────────────────────
window.filtrarEntradas = function() {
    var buscar = ((document.getElementById('ent-buscar')||{}).value||'').toLowerCase();
    var filMes = ((document.getElementById('ent-fil-mes')||{}).value||'');
    window._entFiltrados = (window._entData||[]).filter(function(d) {
        var matchB = !buscar||
            (d.id||'').toLowerCase().includes(buscar)||
            (d.proveedor_nombre||'').toLowerCase().includes(buscar)||
            (d.documento_referencia||'').toLowerCase().includes(buscar);
        var matchM = !filMes||(d.fecha?String(d.fecha).split('T')[0].substring(0,7)===filMes:false);
        return matchB && matchM;
    });
    window._entPagActual = 1;
    window._entRender();
};

window._entRender = function() {
    var datos = window._entFiltrados || [];
    var total = datos.length;
    var totalPag = Math.max(1, Math.ceil(total / _ENT_POR_PAG));
    var pag = Math.min(window._entPagActual, totalPag);
    window._entPagActual = pag;
    var pagina = datos.slice((pag-1)*_ENT_POR_PAG, pag*_ENT_POR_PAG);

    var cont = document.getElementById('ent-contador');
    if (cont) cont.textContent = total+' registro'+(total!==1?'s':'');

    var tbody = document.getElementById('tbody-entradas');
    if (!tbody) return;
    if (!pagina.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-muted"><i class="bi bi-inbox me-2"></i>Sin entradas encontradas</td></tr>';
    } else {
        tbody.innerHTML = pagina.map(function(d) {
            var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
            var tp = parseFloat(d.total_pen||0);
            var totalFmt = 'S/ '+tp.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
            var nitems = (d.items||[]).length;
            return '<tr>'+
                '<td><span class="badge bg-secondary fw-normal">'+_entEsc(d.id||'')+'</span></td>'+
                '<td>'+fecha+'</td>'+
                '<td>'+(d.proveedor_nombre?'<span class="badge bg-info-subtle text-info">'+_entEsc(d.proveedor_nombre)+'</span>':'<span class="text-muted">—</span>')+'</td>'+
                '<td><small>'+_entEsc(d.documento_referencia||'—')+'</small></td>'+
                '<td class="text-center"><span class="badge bg-light text-dark border">'+nitems+' art.</span></td>'+
                '<td class="text-end fw-semibold">'+totalFmt+'</td>'+
                '<td class="text-center"><button class="btn btn-xs btn-outline-danger" onclick="window.eliminarEntrada(\''+_entEsc(d.id)+'\')" title="Eliminar"><i class="bi bi-trash"></i></button></td>'+
            '</tr>';
        }).join('');
    }

    var paginEl = document.getElementById('ent-paginacion');
    if (paginEl) {
        if (totalPag<=1) { paginEl.innerHTML=''; return; }
        paginEl.innerHTML='<div class="d-flex align-items-center gap-1">'+
            '<button class="btn btn-xs btn-outline-secondary" '+(pag<=1?'disabled':'')+' onclick="window._entIrPag('+(pag-1)+')"><i class="bi bi-chevron-left"></i></button>'+
            '<span class="small text-muted mx-2">Pág. '+pag+' / '+totalPag+'</span>'+
            '<button class="btn btn-xs btn-outline-secondary" '+(pag>=totalPag?'disabled':'')+' onclick="window._entIrPag('+(pag+1)+')"><i class="bi bi-chevron-right"></i></button>'+
            '</div>';
    }
};

window._entIrPag = function(n) { window._entPagActual = n; window._entRender(); };
function _entEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Export / Import Excel ────────────────────────────────────────
window.exportarEntradasExcel = function() {
    var datos = window._entData || [];
    if (!datos.length) { alert('No hay datos para exportar.'); return; }
    var cab = ['Código','Fecha','Proveedor','Doc. Referencia','N° Artículos','Total PEN','Moneda','Observaciones'];
    var filas = datos.map(function(d) {
        return [d.id, d.fecha?String(d.fecha).split('T')[0]:'', d.proveedor_nombre||'',
                d.documento_referencia||'', (d.items||[]).length, parseFloat(d.total_pen||0),
                d.moneda||'PEN', d.observaciones||''];
    });
    var ws = XLSX.utils.aoa_to_sheet([cab].concat(filas));
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
