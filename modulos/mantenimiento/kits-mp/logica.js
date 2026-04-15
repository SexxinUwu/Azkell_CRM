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
function _kitsCargarItemsAlmacen(presetVal) {
    fetch('/api/almacen/inventario')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            window._kitsAlmacenItems = data || [];
            var items = (data || []).map(function(x) {
                return { value: x.nombre, label: x.nombre + (x.unidad ? ' [' + x.unidad + ']' : '') };
            });
            if (typeof window._cbInit === 'function') {
                window._cbInit('kits-item-nombre', items, 'Buscar ítem...');
                if (presetVal && typeof window._cbSet === 'function') {
                    window._cbSet('kits-item-nombre', presetVal, presetVal);
                }
            }
        })
        .catch(function(e) { console.error(e); });
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
    fetch('/api/mantenimiento-kits')
        .then(function(r){ return r.ok ? r.json() : { data:[] }; })
        .then(function(j) {
            window.kitsData = j.data || [];
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
        })
        .catch(function(e){ console.error(e); });
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
                '<td colspan="7" class="py-1 px-2" style="font-size:0.75rem; border-bottom:1px dashed var(--border)">' +
                '<span class="badge ' + mpColor + ' me-1">' + k.tipo_mp + '</span>' +
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
                '<button class="btn btn-xs btn-outline-secondary me-1" onclick="window.kitsEditar('+k.id+')" style="font-size:0.7rem;padding:1px 6px"><i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-xs btn-outline-danger" onclick="window.kitsEliminar('+k.id+',\''+((k.item_nombre||'').replace(/'/g,''))+'\')" style="font-size:0.7rem;padding:1px 6px"><i class="bi bi-trash"></i></button>' +
            '</td></tr>';
    });
    tb.innerHTML = html;
};

// ── Abrir Modal nuevo ─────────────────────────────────────────────
window.kitsAbrirModal = function() {
    ['kits-id','kits-marca','kits-unidad','kits-cantidad','kits-costo-unit','kits-costo-total'].forEach(function(id){
        var el=document.getElementById(id); if(el) el.value='';
    });
    if (typeof window._cbReset === 'function') {
        window._cbReset('kits-tipomp');
        window._cbReset('kits-item-nombre');
    }
    var t = document.getElementById('kitsModal-titulo');
    if(t) t.innerHTML='<i class="bi bi-plus-circle me-1 text-primary"></i>Nuevo Ítem de Kit';
    _kitsPopularDatalists();
    _kitsCargarTiposMP();
    _kitsCargarItemsAlmacen();
    _kitsBsModal(document.getElementById('kitsModal')).show();
};

// ── Editar ────────────────────────────────────────────────────────
window.kitsEditar = function(id) {
    var k = window.kitsData.find(function(x){ return x.id===id; });
    if (!k) return;
    var set = function(elId,v){ var el=document.getElementById(elId); if(el) el.value=v||''; };
    set('kits-id',         k.id);
    set('kits-marca',      k.marca_vehiculo);
    set('kits-cantidad',   k.cantidad);
    set('kits-unidad',     k.unidad_medida);
    set('kits-costo-unit', k.costo_unitario);
    set('kits-costo-total',k.costo_total);
    var t = document.getElementById('kitsModal-titulo');
    if(t) t.innerHTML='<i class="bi bi-pencil me-1 text-primary"></i>Editar — ' + (k.item_nombre||'').substring(0,30);
    _kitsPopularDatalists();
    _kitsCargarTiposMP(k.tipo_mp);
    _kitsCargarItemsAlmacen(k.item_nombre);
    _kitsBsModal(document.getElementById('kitsModal')).show();
};

// ── Cálculo automático costo total ───────────────────────────────
window.kitsCalcularTotal = function() {
    var cant  = parseFloat((document.getElementById('kits-cantidad')   ||{}).value||0);
    var cUnit = parseFloat((document.getElementById('kits-costo-unit') ||{}).value||0);
    var ctEl  = document.getElementById('kits-costo-total');
    if (ctEl && cant && cUnit) ctEl.value = (cant * cUnit).toFixed(2);
};

// ── Guardar ───────────────────────────────────────────────────────
window.kitsGuardar = function() {
    var get = function(id){ var el=document.getElementById(id); return el?el.value.trim():''; };
    // Para comboboxes: leer hidden; si vacío, leer txt (entrada libre)
    var getCombo = function(id) {
        var hid = document.getElementById(id);
        var hidVal = hid ? hid.value.trim() : '';
        if (hidVal) return hidVal;
        var txt = document.getElementById(id + '-txt');
        return txt ? txt.value.trim() : '';
    };
    var kitId = get('kits-id');
    var body = {
        marca_vehiculo: get('kits-marca').toUpperCase(),
        tipo_mp:        getCombo('kits-tipomp').toUpperCase(),
        item_nombre:    getCombo('kits-item-nombre'),
        cantidad:       parseFloat(get('kits-cantidad'))     || 1,
        unidad_medida:  get('kits-unidad')        || 'UND',
        costo_unitario: parseFloat(get('kits-costo-unit'))   || 0,
        costo_total:    parseFloat(get('kits-costo-total'))  || 0
    };
    if (!body.marca_vehiculo || !body.item_nombre) {
        return window.mostrarToast('Marca e ítem son requeridos', 'warning');
    }
    var url    = kitId ? '/api/mantenimiento-kits/'+kitId : '/api/mantenimiento-kits';
    var method = kitId ? 'PUT' : 'POST';
    fetch(url, { method:method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
        .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
        .then(function(){
            _kitsBsModal(document.getElementById('kitsModal')).hide();
            window.mostrarToast('Ítem guardado', 'success');
            window.kitsCargarTabla();
        })
        .catch(function(e){ window.mostrarToast('Error: ' + e.message, 'error'); });
};

// ── Eliminar ──────────────────────────────────────────────────────
window.kitsEliminar = function(id, label) {
    if (!confirm('¿Eliminar "' + label + '"?')) return;
    fetch('/api/mantenimiento-kits/'+id, { method:'DELETE' })
        .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
        .then(function(){ window.mostrarToast('Ítem eliminado', 'success'); window.kitsCargarTabla(); })
        .catch(function(e){ window.mostrarToast('Error: ' + e.message, 'error'); });
};
