// ================================================================
// Módulo Kits de Mantenimiento — Azkell Fleet
// Ítems por Kit: marca, tipo MP, nombre kit, repuestos, costos
// ================================================================

function _kitsBsModal(el) {
    if (!el) return { show: function(){}, hide: function(){} };
    return bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el);
}

window.kitsData    = window.kitsData    || [];
window.kitsDataFil = window.kitsDataFil || [];
window._kitsAlmacenItems = window._kitsAlmacenItems || [];

// ── Entry point ───────────────────────────────────────────────────
window['init_kits-mp'] = function() {
    if (!window.checkPerm('cfg_mant', 'l')) {
        window.showNoPermMsg('mod-kits-mp');
        return;
    }
    var btnNuevo = document.querySelector('#mod-kits-mp .btn-primary[onclick*="kitsAbrirModal"]');
    if (btnNuevo) btnNuevo.style.display = window.checkPerm('cfg_mant','c') ? '' : 'none';
    if (typeof window._cbOnSelect === 'function') {
        window._cbOnSelect('kits-fil-marca', function() { window.kitsFiltrar(); });
        window._cbOnSelect('kits-fil-tipo',  function() { window.kitsFiltrar(); });
        // Callback al seleccionar ítem de almacén: auto-rellena unidad y costo
        window._cbOnSelect('kits-item-nombre', function(val) {
            var item = (window._kitsAlmacenItems || []).find(function(x) { return x.nombre === val; });
            if (item) {
                var unidEl  = document.getElementById('kits-unidad');
                var costoEl = document.getElementById('kits-costo-unit');
                if (unidEl)  unidEl.value  = item.unidad || '';
                if (costoEl) costoEl.value = parseFloat(item.costo_referencial || 0).toFixed(2);
                window.kitsCalcularTotal();
            }
        });
    }
    window.kitsCargarTabla();
};

// ── Datalists ─────────────────────────────────────────────────────
function _kitsPopularDatalists() {
    var marcas = [];
    if (window.dataGlobalPlacas) {
        window.dataGlobalPlacas.forEach(function(p) {
            var m = (p[3] || '').trim().toUpperCase();
            if (m && !marcas.includes(m)) marcas.push(m);
        });
    }
    window.kitsData.forEach(function(k) {
        var m = (k.marca_vehiculo || '').trim().toUpperCase();
        if (m && !marcas.includes(m)) marcas.push(m);
    });
    marcas.sort();

    function _fill(id, vals) {
        var dl = document.getElementById(id);
        if (dl) dl.innerHTML = vals.map(function(v){ return '<option value="'+v+'">'; }).join('');
    }
    _fill('kits-dl-marcas', marcas);
}

// ── Cargar combobox Tipos de Preventivo (modal) ───────────────────
function _kitsCargarTiposMP(presetVal) {
    fetch('/api/tipos-preventivo')
        .then(function(r) { return r.ok ? r.json() : { data: [] }; })
        .then(function(j) {
            var items = (j.data || []).map(function(t) { return { value: t.nombre, label: t.nombre }; });
            if (typeof window._cbInit === 'function') {
                window._cbInit('kits-tipomp', items, 'Buscar tipo...');
                if (presetVal && typeof window._cbSet === 'function') {
                    window._cbSet('kits-tipomp', presetVal, presetVal);
                }
            }
        })
        .catch(function(e) { console.error(e); });
}

// ── Cargar combobox Ítems de Almacén (modal) ─────────────────────
function _kitsGenerarOpcionesItems() {
    var items = (window._kitsAlmacenItems || []).map(function(x) {
        return { value: x.nombre, label: x.nombre + (x.unidad ? ' [' + x.unidad + ']' : '') };
    });
    return items;
}

// ── Helper blur para combobox en formulario (sync texto→hidden) ───
window._kitsHideCombo = function(id) {
    setTimeout(function() {
        var dd  = document.getElementById(id + '-dd');
        if (dd) dd.style.display = 'none';
        var txt = document.getElementById(id + '-txt');
        var hid = document.getElementById(id);
        // Si no se seleccionó opción pero hay texto escrito, guardar texto en hidden
        if (txt && hid && !hid.value && txt.value.trim()) {
            hid.value = txt.value.trim();
        }
    }, 180);
};

// ── Cargar tabla ──────────────────────────────────────────────────
window.kitsCargarTabla = function() {
    var tb = document.getElementById('kits-tbody');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="11" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>';
    
    Promise.all([
        fetch('/api/mantenimiento-kits').then(function(r){ return r.ok ? r.json() : { data:[] }; }),
        fetch('/api/almacen/inventario').then(function(r){ return r.ok ? r.json() : []; })
    ]).then(function(res) {
        var kitsResp = res[0];
        var invData = res[1];

        // Cache global inventory items with latest cost
        window._kitsAlmacenItems = (invData || []).map(function(x) {
            return {
                nombre: x.articulo || x.nombre || x.descripcion || '',
                unidad: x.unidad || '',
                costo_referencial: parseFloat(x.costo_soles != null ? x.costo_soles : (x.costo_referencial||0))
            };
        });

        window.kitsData = kitsResp.data || [];
        // Update kits with latest prices from inventory
        window.kitsData.forEach(function(k) {
            var invItem = window._kitsAlmacenItems.find(function(x){ return x.nombre === k.item_nombre; });
            if (invItem && invItem.costo_referencial > 0) {
                k.costo_unitario = invItem.costo_referencial;
                k.costo_total = k.cantidad * k.costo_unitario;
            }
        });

        window.kitsDataFil = window.kitsData.slice();

        var prevMarca = typeof window._cbGet === 'function' ? window._cbGet('kits-fil-marca') : '';
        var prevTipo  = typeof window._cbGet === 'function' ? window._cbGet('kits-fil-tipo')  : '';

        var marcas = [];
        window.kitsData.forEach(function(k){ var m=(k.marca_vehiculo||'').toUpperCase(); if(m && !marcas.includes(m)) marcas.push(m); });
        marcas.sort();
        var itemsMarca = marcas.map(function(m){ return { value: m, label: m }; });
        if (typeof window._cbInit === 'function') { window._cbInit('kits-fil-marca', itemsMarca, 'Todas las marcas'); if (prevMarca) window._cbSet('kits-fil-marca', prevMarca, prevMarca); }

        var tipos = [];
        window.kitsData.forEach(function(k){ if(k.tipo_mp && !tipos.includes(k.tipo_mp)) tipos.push(k.tipo_mp); });
        tipos.sort();
        var itemsTipo = tipos.map(function(t){ return { value: t, label: t }; });
        if (typeof window._cbInit === 'function') { window._cbInit('kits-fil-tipo', itemsTipo, 'Todo MP'); if (prevTipo) window._cbSet('kits-fil-tipo', prevTipo, prevTipo); }
        _kitsPopularDatalists();
        window.kitsFiltrar();
    }).catch(function(e){ console.error(e); });
};

// ── Filtrar tabla ─────────────────────────────────────────────────
window.kitsFiltrar = function() {
    var filMarca = ((document.getElementById('kits-fil-marca')||{}).value||'');
    var filTipo  = ((document.getElementById('kits-fil-tipo') ||{}).value||'');
    window.kitsDataFil = window.kitsData.filter(function(k) {
        return (!filMarca || (k.marca_vehiculo||'').toUpperCase()===filMarca.toUpperCase()) &&
               (!filTipo  || k.tipo_mp===filTipo);
    });
    var tb = document.getElementById('kits-tbody');
    if (!tb) return;
    if (!window.kitsDataFil.length) {
        tb.innerHTML = '<tr><td colspan="8" class="text-center py-4" style="color:var(--subtext)">Sin ítems de kits</td></tr>';
        return;
    }
    var html = '';
    var lastMarca = null;
    var lastTipo  = null;
    window.kitsDataFil.forEach(function(k) {
        if (k.marca_vehiculo !== lastMarca) {
            html += '<tr style="background:var(--surface)">' +
                '<td colspan="8" class="fw-bold py-1 px-2" style="font-size:0.8rem; border-top:2px solid var(--border); color:var(--text)">' +
                '<i class="bi bi-truck me-1" style="color:var(--primary,#5865F2)"></i>' + (k.marca_vehiculo||'—') + '</td></tr>';
            lastMarca = k.marca_vehiculo;
            lastTipo  = null;
        }
        if (k.tipo_mp !== lastTipo) {
            var mpColor = k.tipo_mp === 'MP1' ? 'bg-primary' : k.tipo_mp === 'MP2' ? 'bg-success' : k.tipo_mp === 'MP3' ? 'bg-warning text-dark' : 'bg-info text-dark';
            html += '<tr style="background:var(--bg)">' +
                '<td></td>' +
                '<td colspan="7" class="py-1 px-2 d-flex justify-content-between align-items-center" style="font-size:0.75rem; border-bottom:1px dashed var(--border)">' +
                '<span><span class="badge ' + mpColor + ' me-1">' + k.tipo_mp + '</span>' + (k.nombre_kit ? ' <span class="text-muted fw-bold ms-2">' + k.nombre_kit + '</span>' : '') + '</span>' +
                (window.checkPerm('cfg_mant','e') ? '<button class="btn btn-xs btn-outline-primary" onclick="window.kitsEditarKit(\''+k.marca_vehiculo+'\',\''+k.tipo_mp+'\')" style="font-size:0.7rem;padding:2px 8px"><i class="bi bi-pencil me-1"></i>Editar Kit</button>' : '') +
                '</td></tr>';
            lastTipo = k.tipo_mp;
        }
        html += '<tr>' +
            '<td></td><td></td>' +
            '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (k.item_nombre||'—') + '</td>' +
            '<td>' + (k.cantidad||0) + '</td><td>' + (k.unidad_medida||'') + '</td>' +
            '<td>S/.' + parseFloat(k.costo_unitario||0).toFixed(2) + '</td>' +
            '<td class="fw-bold">S/.' + parseFloat(k.costo_total||0).toFixed(2) + '</td>' +
            '<td class="text-end">' +
                (window.checkPerm('cfg_mant','d') ? '<button class="btn btn-xs btn-outline-danger" onclick="window.kitsEliminar('+k.id+',\''+((k.item_nombre||'').replace(/'/g,''))+'\')" style="font-size:0.7rem;padding:1px 6px"><i class="bi bi-trash"></i></button>' : '') +
            '</td></tr>';
    });
    tb.innerHTML = html;
};

window.kitsDeleted = [];
window.kitsRowCounter = 0;

// ── Abrir Modal nuevo ─────────────────────────────────────────────
window.kitsAbrirModal = function() {
    var mEl = document.getElementById('kits-marca');
    if (mEl) mEl.value = '';
    if (typeof window._cbReset === 'function') window._cbReset('kits-tipomp');
    
    var tb = document.getElementById('kits-form-tbody');
    if (tb) tb.innerHTML = '';
    var gt = document.getElementById('kits-form-grand-total');
    if (gt) gt.textContent = '0.00';
    
    window.kitsDeleted = [];
    
    var t = document.getElementById('kitsModal-titulo');
    if(t) t.innerHTML='<i class="bi bi-plus-circle me-1 text-primary"></i>Configurar Kit de Mantenimiento';
    
    _kitsPopularDatalists();
    _kitsCargarTiposMP();
    
    window.kitsAgregarFila();
    _kitsBsModal(document.getElementById('kitsModal')).show();
};

// ── Editar Kit (Grupo) ────────────────────────────────────────────
window.kitsEditarKit = function(marca, tipo) {
    var mEl = document.getElementById('kits-marca');
    if (mEl) mEl.value = marca;
    
    var t = document.getElementById('kitsModal-titulo');
    if(t) t.innerHTML='<i class="bi bi-pencil me-1 text-primary"></i>Editar Kit — ' + marca + ' ' + tipo;
    
    _kitsPopularDatalists();
    _kitsCargarTiposMP(tipo);
    
    var tbody = document.getElementById('kits-form-tbody');
    if (tbody) tbody.innerHTML = '';
    window.kitsDeleted = [];
    
    var items = window.kitsData.filter(function(k) {
        return (k.marca_vehiculo||'').toUpperCase() === (marca||'').toUpperCase() && 
               (k.tipo_mp||'').toUpperCase() === (tipo||'').toUpperCase();
    });
    
    items.forEach(function(k) { window.kitsAgregarFila(k); });
    if (items.length === 0) window.kitsAgregarFila();
    
    window.kitsRecalcularFormulario();
    _kitsBsModal(document.getElementById('kitsModal')).show();
};

window.kitsAgregarFila = function(data) {
    data = data || {};
    var rid = 'kr_' + (++window.kitsRowCounter);
    var tr = document.createElement('tr');
    tr.id = rid;
    if (data.id) tr.dataset.id = data.id;
    
    var cbId = 'cb_' + rid;
    var html = '';
    html += '<td>';
    html += '<div class="position-relative">';
    html += '<input type="text" id="'+cbId+'-txt" class="form-control form-control-sm kit-item-input" placeholder="Buscar ítem..." autocomplete="off" oninput="window._cbFiltrar(\''+cbId+'\')" onfocus="window._cbFiltrar(\''+cbId+'\')" onblur="window._kitsHideCombo(\''+cbId+'\')">';
    html += '<input type="hidden" id="'+cbId+'">';
    html += '<div id="'+cbId+'-dd" class="cb-dropdown"></div>';
    html += '</div></td>';
    html += '<td><input type="number" class="form-control form-control-sm kit-cant" value="'+(data.cantidad||1)+'" step="0.01" oninput="window.kitsRecalcularFormulario()"></td>';
    html += '<td><input type="text" class="form-control form-control-sm kit-unid" value="'+(data.unidad_medida||'')+'" readonly style="background:rgba(0,0,0,.03); color:var(--subtext)"></td>';
    html += '<td><input type="number" class="form-control form-control-sm kit-costo" value="'+(data.costo_unitario||0)+'" step="0.01" oninput="window.kitsRecalcularFormulario()"></td>';
    html += '<td><input type="number" class="form-control form-control-sm kit-total" value="'+(data.costo_total||0)+'" step="0.01" readonly style="background:rgba(0,0,0,.03); font-weight:bold; color:var(--text)"></td>';
    html += '<td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger" style="padding: 2px 8px;" onclick="window.kitsEliminarFila(this)"><i class="bi bi-trash"></i></button></td>';
    
    tr.innerHTML = html;
    var tb = document.getElementById('kits-form-tbody');
    if (tb) tb.appendChild(tr);
    
    var opciones = _kitsGenerarOpcionesItems();
    if (typeof window._cbInit === 'function') {
        window._cbInit(cbId, opciones, 'Buscar ítem...');
        if (data.item_nombre) window._cbSet(cbId, data.item_nombre, data.item_nombre);
    }
    
    if (typeof window._cbOnSelect === 'function') {
        window._cbOnSelect(cbId, function(val) {
            var item = (window._kitsAlmacenItems || []).find(function(x) { return x.nombre === val; });
            if (item) {
                tr.querySelector('.kit-unid').value = item.unidad || '';
                tr.querySelector('.kit-costo').value = parseFloat(item.costo_referencial || 0).toFixed(2);
                window.kitsRecalcularFormulario();
            }
        });
    }
};

window.kitsEliminarFila = function(btn) {
    var tr = btn.closest('tr');
    if (tr.dataset.id) window.kitsDeleted.push(tr.dataset.id);
    tr.remove();
    window.kitsRecalcularFormulario();
};

window.kitsRecalcularFormulario = function() {
    var trs = document.querySelectorAll('#kits-form-tbody tr');
    var grandTotal = 0;
    trs.forEach(function(tr) {
        var cant = parseFloat(tr.querySelector('.kit-cant').value) || 0;
        var cost = parseFloat(tr.querySelector('.kit-costo').value) || 0;
        var tot = cant * cost;
        tr.querySelector('.kit-total').value = tot.toFixed(2);
        grandTotal += tot;
    });
    var gt = document.getElementById('kits-form-grand-total');
    if (gt) gt.textContent = grandTotal.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2});
};

// ── Guardar (Múltiples Ítems) ─────────────────────────────────────
window.kitsGuardar = function() {
    var getCombo = function(id) {
        var hid = document.getElementById(id);
        var hidVal = hid ? hid.value.trim() : '';
        if (hidVal) return hidVal;
        var txt = document.getElementById(id + '-txt');
        return txt ? txt.value.trim() : '';
    };
    
    var marca = (document.getElementById('kits-marca').value||'').trim().toUpperCase();
    var tipo  = getCombo('kits-tipomp').toUpperCase();
    
    if (!marca || !tipo) return window.mostrarToast('Marca y Tipo de Mantenimiento son requeridos', 'warning');
    
    var items = [];
    var trs = document.querySelectorAll('#kits-form-tbody tr');
    for (var i = 0; i < trs.length; i++) {
        var tr = trs[i];
        var cbId = tr.id.replace('kr_', 'cb_kr_');
        var itemName = getCombo(cbId);
        if (!itemName) continue;
        
        items.push({
            id: tr.dataset.id || null,
            marca_vehiculo: marca,
            tipo_mp: tipo,
            item_nombre: itemName,
            cantidad: parseFloat(tr.querySelector('.kit-cant').value) || 1,
            unidad_medida: tr.querySelector('.kit-unid').value || 'UND',
            costo_unitario: parseFloat(tr.querySelector('.kit-costo').value) || 0,
            costo_total: parseFloat(tr.querySelector('.kit-total').value) || 0
        });
    }
    
    if (items.length === 0 && window.kitsDeleted.length === 0) {
        return window.mostrarToast('Debe añadir al menos un ítem', 'warning');
    }
    
    var promises = [];
    window.kitsDeleted.forEach(function(did) {
        promises.push(fetch('/api/mantenimiento-kits/'+did, { method: 'DELETE' }));
    });
    
    items.forEach(function(it) {
        var url = it.id ? '/api/mantenimiento-kits/'+it.id : '/api/mantenimiento-kits';
        var method = it.id ? 'PUT' : 'POST';
        promises.push(fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(it) }));
    });
    
    var btn = document.querySelector('#kitsModal .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...'; }
    
    Promise.all(promises).then(function() {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save me-1"></i>Guardar Kit'; }
        _kitsBsModal(document.getElementById('kitsModal')).hide();
        window.mostrarToast('Kit guardado', 'success');
        window.kitsCargarTabla();
    }).catch(function(e) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save me-1"></i>Guardar Kit'; }
        window.mostrarToast('Error: ' + e.message, 'error');
    });
};

// ── Eliminar ──────────────────────────────────────────────────────
window.kitsEliminar = function(id, label) {
    if (!window.guardAction('cfg_mant', 'd')) return;
    if (!confirm('¿Eliminar "' + label + '"?')) return;
    fetch('/api/mantenimiento-kits/'+id, { method:'DELETE' })
        .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
        .then(function(){ window.mostrarToast('Ítem eliminado', 'success'); window.kitsCargarTabla(); })
        .catch(function(e){ window.mostrarToast('Error: ' + e.message, 'error'); });
};

// ── Exportar Excel ────────────────────────────────────────────────
window.kitsExportarExcel = function() {
    var datos = window.kitsData || [];
    if (!datos.length) { alert('No hay kits para exportar.'); return; }
    var wb = XLSX.utils.book_new();
    var filas = [['ID','Marca Vehículo','Tipo MP','Nombre Kit','Ítem (Artículo)','Cantidad','Unidad','Costo Unit.','Costo Total']];
    datos.forEach(function(k) {
        filas.push([k.id||'', k.marca_vehiculo||'', k.tipo_mp||'', k.nombre_kit||'',
            k.item_nombre||'', k.cantidad||0, k.unidad_medida||'',
            parseFloat(k.costo_unitario||0).toFixed(2), parseFloat(k.costo_total||0).toFixed(2)]);
    });
    var ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = [6,16,8,20,28,8,10,10,10].map(function(w){ return {wch:w}; });
    XLSX.utils.book_append_sheet(wb, ws, 'Kits MP');
    XLSX.writeFile(wb, 'KitsMP_'+new Date().toISOString().slice(0,10)+'.xlsx');
};

// ── Descargar Plantilla ───────────────────────────────────────────
window.kitsDescargarPlantilla = function() {
    var wb = XLSX.utils.book_new();
    var filas = [
        ['Marca Vehículo','Tipo MP','Nombre Kit','Ítem (Artículo)','Cantidad','Unidad','Costo Unit.'],
        ['VOLVO','MP1','Kit 15K','Filtro de Aceite',1,'UND',25.00],
        ['VOLVO','MP1','Kit 15K','Aceite Motor 15W40',12,'LT',18.50]
    ];
    var ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = [16,8,20,28,8,10,10].map(function(w){ return {wch:w}; });
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, 'Plantilla_KitsMP.xlsx');
};

// ── Importar Excel ────────────────────────────────────────────────
window.kitsImportarExcel = function(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var wb = XLSX.read(e.target.result, { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
            if (!rows.length) { alert('El archivo está vacío.'); return; }
            var payload = rows.map(function(r) {
                return {
                    marca_vehiculo: String(r['Marca Vehículo'] || r.marca_vehiculo || '').trim().toUpperCase(),
                    tipo_mp:        String(r['Tipo MP']         || r.tipo_mp        || '').trim().toUpperCase(),
                    nombre_kit:     String(r['Nombre Kit']      || r.nombre_kit     || '').trim(),
                    item_nombre:    String(r['Ítem (Artículo)'] || r['Item (Articulo)'] || r.item_nombre || '').trim(),
                    cantidad:       parseFloat(r['Cantidad']    || r.cantidad       || 0),
                    unidad_medida:  String(r['Unidad']          || r.unidad_medida  || '').trim(),
                    costo_unitario: parseFloat(r['Costo Unit.'] || r.costo_unitario || 0)
                };
            }).filter(function(r) { return r.marca_vehiculo && r.nombre_kit; });
            if (!payload.length) { alert('No se encontraron filas válidas.'); return; }
            if (!confirm('Se importarán ' + payload.length + ' ítems de kit. ¿Continuar?')) return;
            fetch('/api/mantenimiento-kits/importarMasivo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: payload })
            })
            .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
            .then(function(res) {
                alert('Importados: ' + res.insertados + ' nuevos, ' + (res.actualizados||0) + ' actualizados.');
                window.kitsCargarTabla();
            })
            .catch(function(err) { alert('Error: ' + err.message); });
        } catch(ex) { alert('Error leyendo Excel: ' + ex.message); }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
};
