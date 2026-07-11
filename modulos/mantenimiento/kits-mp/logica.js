// ================================================================
// Módulo Kits de Mantenimiento — Azkell Fleet
// Ítems por Kit: marca, tipo MP, nombre kit, repuestos, costos
// ================================================================

window._kitsAbrirPanel = function() {
    document.getElementById('kits-backdrop').style.display = 'block';
    setTimeout(function() {
        var p = document.getElementById('kits-panel-detalle');
        if (p) p.classList.add('open');
    }, 10);
};
window._kitsCerrarModal = function() {
    var p = document.getElementById('kits-panel-detalle');
    if (p) p.classList.remove('open');
    setTimeout(function() {
        var b = document.getElementById('kits-backdrop');
        if (b) b.style.display = 'none';
    }, 280);
};

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

    var items = marcas.map(function(m) { return { value: m, label: m }; });
    if (typeof window._cbInit === 'function') {
        window._cbInit('kits-marca', items, 'Buscar marca...');
        window._cbInit('kits-modelo', [], 'Buscar modelo...');
        window._cbCallbacks = window._cbCallbacks || {};
        window._cbCallbacks['kits-marca'] = function(val) { window.kitsMarcaCambiada(val); window.kitsActualizarTituloModal(); };
        window._cbCallbacks['kits-modelo'] = function(val) { window.kitsActualizarTituloModal(); };
    }
}

window.kitsMarcaCambiada = function(marcaStr) {
    if(!marcaStr) return;
    marcaStr = marcaStr.toUpperCase();
    
    // Poblar datalist con modelos de esta marca
    var modelos = [];
    if (window.dataGlobalPlacas) {
        window.dataGlobalPlacas.forEach(function(p) {
            var mMarca = (p[3] || '').trim().toUpperCase();
            var mMod = (p[4] || '').trim().toUpperCase();
            if (mMarca === marcaStr && mMod && mMod !== '-' && !modelos.includes(mMod)) {
                modelos.push(mMod);
            }
        });
    }
    window.kitsData.forEach(function(k) {
        var mMarca = (k.marca_vehiculo || '').trim().toUpperCase();
        var mMod = (k.modelo_vehiculo || 'TODOS LOS MODELOS').trim().toUpperCase();
        if (mMarca === marcaStr && mMod && mMod !== 'TODOS LOS MODELOS' && !modelos.includes(mMod)) {
            modelos.push(mMod);
        }
    });
    modelos.sort();
    
    var itemsMod = modelos.map(function(m){ return { value: m, label: m }; });
    if (typeof window._cbInit === 'function') {
        window._cbInit('kits-modelo', itemsMod, 'Todos los modelos');
    }

    if (modelos.length === 1) {
        if(window._cbSet) window._cbSet('kits-modelo', modelos[0], modelos[0]);
        else document.getElementById('kits-modelo').value = modelos[0];
    } else {
        if(window._cbSet) window._cbSet('kits-modelo', '', '');
        else document.getElementById('kits-modelo').value = '';
    }
};

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
                window._cbCallbacks = window._cbCallbacks || {};
                window._cbCallbacks['kits-tipomp'] = function(val) { window.kitsActualizarTituloModal(); };
                window._cbCallbacks = window._cbCallbacks || {};
                window._cbCallbacks['kits-tipomp'] = function(val) { window.kitsActualizarTituloModal(); };
                window._cbCallbacks = window._cbCallbacks || {};
                window._cbCallbacks['kits-tipomp'] = function(val) { window.kitsActualizarTituloModal(); };
            }
        })
        .catch(function(e) { console.error(e); });
}

// ── Cargar combobox Ítems de Almacén (modal) ─────────────────────
function _kitsGenerarOpcionesItems() {
    var items = (window._kitsAlmacenItems || []).map(function(x) {
        return { value: x.nombre, label: x.nombre };
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
        var prevModelo = typeof window._cbGet === 'function' ? window._cbGet('kits-fil-modelo') : '';
        var prevTipo  = typeof window._cbGet === 'function' ? window._cbGet('kits-fil-tipo')  : '';

        var marcas = [];
        window.kitsData.forEach(function(k){ var m=(k.marca_vehiculo||'').toUpperCase(); if(m && !marcas.includes(m)) marcas.push(m); });
        marcas.sort();
        var itemsMarca = marcas.map(function(m){ return { value: m, label: m }; });
        if (typeof window._cbInit === 'function') { window._cbInit('kits-fil-marca', itemsMarca, 'Todas las marcas'); if (prevMarca) window._cbSet('kits-fil-marca', prevMarca, prevMarca); }

        var modelos = [];
        window.kitsData.forEach(function(k){ var m=(k.modelo_vehiculo||'TODOS LOS MODELOS').toUpperCase(); if(m && !modelos.includes(m)) modelos.push(m); });
        modelos.sort();
        var itemsModelo = modelos.map(function(m){ return { value: m, label: m }; });
        if (typeof window._cbInit === 'function') { window._cbInit('kits-fil-modelo', itemsModelo, 'Todos los modelos'); if (prevModelo) window._cbSet('kits-fil-modelo', prevModelo, prevModelo); }

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
    var filModelo = ((document.getElementById('kits-fil-modelo')||{}).value||'');
    var filTipo  = ((document.getElementById('kits-fil-tipo') ||{}).value||'');
    window.kitsDataFil = window.kitsData.filter(function(k) {
        return (!filMarca || (k.marca_vehiculo||'').toUpperCase()===filMarca.toUpperCase()) &&
               (!filModelo || (k.modelo_vehiculo||'TODOS LOS MODELOS').toUpperCase()===filModelo.toUpperCase()) &&
               (!filTipo  || k.tipo_mp===filTipo);
    });
    
    var tb = document.getElementById('kits-tbody');
    var grid = document.getElementById('kits-grid-mobile');
    
    if (!window.kitsDataFil.length) {
        if (tb) tb.innerHTML = '<tr><td colspan="8" class="text-center py-4" style="color:var(--subtext)">Sin ítems de kits</td></tr>';
        if (grid) grid.innerHTML = '<div class="text-center py-5" style="color:var(--subtext)">Sin ítems de kits</div>';
        return;
    }
    
    var html = '';
    var htmlMobile = '';
    
    var lastMarca = null;
    var lastModelo = null;
    var lastTipo  = null;
    
    window.kitsDataFil.forEach(function(k, index) {
        // --- DESKTOP TABLE LOGIC ---
        if (k.marca_vehiculo !== lastMarca || (k.modelo_vehiculo||'TODOS LOS MODELOS') !== lastModelo) {
            var dispModelo = (k.modelo_vehiculo && k.modelo_vehiculo !== 'TODOS LOS MODELOS') ? (' - ' + k.modelo_vehiculo) : '';
            html += '<tr style="background:var(--surface)">' +
                '<td colspan="8" class="fw-bold py-1 px-2" style="font-size:0.8rem; border-top:2px solid var(--border); color:var(--text)">' +
                '<i class="bi bi-truck me-1" style="color:var(--primary,#5865F2)"></i>' + (k.marca_vehiculo||'—') + dispModelo + '</td></tr>';
            lastMarca = k.marca_vehiculo;
            lastModelo = k.modelo_vehiculo || 'TODOS LOS MODELOS';
            lastTipo  = null;
        }
        if (k.tipo_mp !== lastTipo) {
            var mpColor = k.tipo_mp === 'MP1' ? 'bg-primary' : k.tipo_mp === 'MP2' ? 'bg-success' : k.tipo_mp === 'MP3' ? 'bg-warning text-dark' : 'bg-info text-dark';
            html += '<tr style="background:var(--bg)">' +
                '<td></td>' +
                '<td colspan="7" class="py-1 px-2" style="font-size:0.75rem; border-bottom:1px dashed var(--border)">' +
                '<div class="d-flex justify-content-between align-items-center">' +
                '<span><span class="badge ' + mpColor + ' me-1">' + k.tipo_mp + '</span>' + (k.nombre_kit ? ' <span class="text-muted fw-bold ms-2">' + k.nombre_kit + '</span>' : '') + '</span>' +
                (window.checkPerm('cfg_mant','e') ? '<button class="btn btn-xs btn-outline-primary" onclick="window.kitsEditarKit(\''+k.marca_vehiculo+'\',\''+(k.modelo_vehiculo||'TODOS LOS MODELOS')+'\',\''+k.tipo_mp+'\')" style="font-size:0.7rem;padding:2px 8px"><i class="bi bi-pencil me-1"></i>Editar Kit</button>' : '') +
                '</div></td></tr>';
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
            
        // --- MOBILE CARDS LOGIC ---
        var nextK = window.kitsDataFil[index + 1];
        
        // Boundaries for MARCA
        var isFirstOfMarca = index === 0 || k.marca_vehiculo !== window.kitsDataFil[index-1].marca_vehiculo || (k.modelo_vehiculo||'TODOS LOS MODELOS') !== (window.kitsDataFil[index-1].modelo_vehiculo||'TODOS LOS MODELOS');
        var isLastOfMarca = !nextK || nextK.marca_vehiculo !== k.marca_vehiculo || (nextK.modelo_vehiculo||'TODOS LOS MODELOS') !== (k.modelo_vehiculo||'TODOS LOS MODELOS');
        
        // Boundaries for TIPO_MP (within Marca)
        var isFirstOfTipo = isFirstOfMarca || k.tipo_mp !== window.kitsDataFil[index-1].tipo_mp;
        var isLastOfTipo = isLastOfMarca || nextK.tipo_mp !== k.tipo_mp;
        
        if (isFirstOfMarca) {
            htmlMobile += '<div class="kits-list-card">';
            htmlMobile += '  <div style="padding: 1rem; border-bottom: 2px dashed #f1f5f9; display: flex; align-items: center; gap: 0.5rem; background:#f8fafc; border-radius: 16px 16px 0 0;">';
            htmlMobile += '    <i class="bi bi-truck" style="color:var(--primary,#5865F2);"></i>';
            var dMod = (k.modelo_vehiculo && k.modelo_vehiculo !== 'TODOS LOS MODELOS') ? (' <span style="font-weight:600;color:#64748b;font-size:0.85rem">- '+k.modelo_vehiculo+'</span>') : '';
            htmlMobile += '    <span style="font-weight:900; font-size:1rem; color:#0f172a;">' + (k.marca_vehiculo||'—') + dMod + '</span>';
            htmlMobile += '  </div>';
            htmlMobile += '  <div style="padding: 0.5rem 1rem 1rem 1rem;">';
        }
        
        if (isFirstOfTipo) {
            var mpColorM = k.tipo_mp === 'MP1' ? 'bg-primary' : k.tipo_mp === 'MP2' ? 'bg-success' : k.tipo_mp === 'MP3' ? 'bg-warning text-dark' : 'bg-info text-dark';
            htmlMobile += '    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.75rem; margin-bottom:0.5rem;">';
            htmlMobile += '       <div>';
            htmlMobile += '         <span class="badge ' + mpColorM + ' me-1">' + k.tipo_mp + '</span>';
            htmlMobile += '         <span style="font-weight:700; font-size:0.85rem; color:#334155;">' + (k.nombre_kit || 'Kit') + '</span>';
            htmlMobile += '       </div>';
            if (window.checkPerm('cfg_mant','e')) {
                htmlMobile += '       <button class="btn btn-sm btn-outline-primary" style="padding:2px 10px; border-radius:12px; font-weight:700;" onclick="window.kitsEditarKit(\''+k.marca_vehiculo+'\',\''+(k.modelo_vehiculo||'TODOS LOS MODELOS')+'\',\''+k.tipo_mp+'\')"><i class="bi bi-pencil"></i></button>';
            }
            htmlMobile += '    </div>';
            htmlMobile += '    <div style="display:flex; flex-direction:column; gap:0.5rem;">';
        }
        
        htmlMobile += '      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #f1f5f9; padding-bottom:0.5rem;">';
        htmlMobile += '        <div style="flex:1; min-width:0; padding-right:0.5rem;">';
        htmlMobile += '           <div style="font-weight:700; font-size:0.85rem; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + (k.item_nombre||'—') + '</div>';
        htmlMobile += '           <div style="font-size:0.7rem; color:#64748b; margin-top:2px;">' + (k.cantidad||0) + ' ' + (k.unidad_medida||'') + ' x S/.' + parseFloat(k.costo_unitario||0).toFixed(2) + '</div>';
        htmlMobile += '        </div>';
        htmlMobile += '        <div class="text-end" style="flex-shrink:0;">';
        htmlMobile += '           <div style="font-weight:900; font-size:0.85rem; color:#0f172a;">S/.' + parseFloat(k.costo_total||0).toFixed(2) + '</div>';
        if (window.checkPerm('cfg_mant','d')) {
            htmlMobile += '           <button class="btn btn-link text-danger p-0 mt-1" style="font-size:0.75rem; text-decoration:none;" onclick="window.kitsEliminar('+k.id+',\''+((k.item_nombre||'').replace(/'/g,''))+'\')"><i class="bi bi-trash"></i> Eliminar</button>';
        }
        htmlMobile += '        </div>';
        htmlMobile += '      </div>';
        
        if (isLastOfTipo) {
            htmlMobile += '    </div>'; // close the flex-column items container
        }
        
        if (isLastOfMarca) {
            htmlMobile += '  </div>'; // close the padding container
            htmlMobile += '</div>'; // close kits-list-card
        }
    });
    
    if (tb) tb.innerHTML = html;
    if (grid) grid.innerHTML = htmlMobile;
};

window.kitsDeleted = [];
window.kitsRowCounter = 0;

// ── Abrir Modal nuevo ─────────────────────────────────────────────
window.kitsAbrirModal = function() {
    if(window._cbSet) {
        window._cbSet('kits-marca', '', '');
        window._cbSet('kits-modelo', '', '');
        window._cbSet('kits-tipomp', '', '');
    }
    
    var tb = document.getElementById('kits-form-container');
    if (tb) tb.innerHTML = '';
    var gt = document.getElementById('kits-form-grand-total');
    if (gt) gt.textContent = '0.00';
    
    window.kitsDeleted = [];
    
    window.kitsActualizarTituloModal();
    
    _kitsPopularDatalists();
    _kitsCargarTiposMP();
    
    window.kitsAgregarFila();
    window._kitsAbrirPanel();
};

// ── Editar Kit (Grupo) ────────────────────────────────────────────
window.kitsEditarKit = function(marca, modelo, tipo) {
    if(window._cbSet) { window._cbSet('kits-marca', marca, marca); window._cbSet('kits-modelo', modelo, modelo); }
    window.kitsActualizarTituloModal();
    
    _kitsPopularDatalists();
    _kitsCargarTiposMP(tipo);
    
    var tbody = document.getElementById('kits-form-container');
    if (tbody) tbody.innerHTML = '';
    window.kitsDeleted = [];
    
    var items = window.kitsData.filter(function(k) {
        return (k.marca_vehiculo||'').toUpperCase() === (marca||'').toUpperCase() && 
               (k.modelo_vehiculo||'TODOS LOS MODELOS').toUpperCase() === (modelo||'TODOS LOS MODELOS').toUpperCase() &&
               (k.tipo_mp||'').toUpperCase() === (tipo||'').toUpperCase();
    });
    
    items.forEach(function(k) { window.kitsAgregarFila(k); });
    if (items.length === 0) window.kitsAgregarFila();
    
    window.kitsRecalcularFormulario();
    window._kitsAbrirPanel();
};

window.kitsAgregarFila = function(data) {
    data = data || {};
    var rid = 'kr_' + (++window.kitsRowCounter);
    
    var tr = document.createElement('div');
    tr.id = rid;
    tr.className = 'kits-item-card kit-card';
    if (data.id) tr.dataset.id = data.id;
    
    var cbId = 'cb_' + rid;
    var html = '';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
    html += '<div style="flex:1;position:relative;">';
    html += '<input type="text" id="'+cbId+'-txt" class="kits-input-sm kit-item-input" placeholder="Buscar artículo..." autocomplete="off" oninput="window._cbFiltrar(\''+cbId+'\')" onfocus="window._cbFiltrar(\''+cbId+'\')" onblur="window._kitsHideCombo(\''+cbId+'\')">';
    html += '<input type="hidden" id="'+cbId+'" class="kit-desc">';
    html += '<div id="'+cbId+'-dd" class="cb-dropdown"></div>';
    html += '</div>';
    html += '<button type="button" onclick="window.kitsEliminarFila(this)" style="width:38px;height:38px;border-radius:12px;background:#fef2f2;border:1.5px solid #fecaca;color:#ef4444;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;"><i class="bi bi-x-lg"></i></button>';
    html += '</div>';
    
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">';
    html += '<div><div class="kits-field-label">CANT.</div><input type="number" class="kits-input-sm kit-cant" value="'+(data.cantidad||1)+'" step="0.01" oninput="window.kitsRecalcularFormulario()"></div>';
    html += '<div><div class="kits-field-label">UNID.</div><input type="text" class="kits-input-sm kit-unid" value="'+(data.unidad_medida||'')+'" readonly style="background:rgba(0,0,0,.03); color:var(--subtext)"></div>';
    html += '<div><div class="kits-field-label">C. UNIT.</div><input type="number" class="kits-input-sm kit-costo" value="'+(data.costo_unitario||0)+'" step="0.01" oninput="window.kitsRecalcularFormulario()"></div>';
    html += '<div><div class="kits-field-label">IMPORTE</div><input type="number" class="kits-input-sm kit-total" value="'+(data.costo_total||0)+'" step="0.01" readonly style="background:rgba(0,0,0,.03); font-weight:bold; color:var(--text)"></div>';
    html += '</div>';
    
    tr.innerHTML = html;
    var tb = document.getElementById('kits-form-container');
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
    var tr = btn.closest('.kit-card');
    if (tr.dataset.id) window.kitsDeleted.push(tr.dataset.id);
    tr.remove();
    window.kitsRecalcularFormulario();
};

window.kitsRecalcularFormulario = function() {
    var trs = document.querySelectorAll('#kits-form-container .kit-card');
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
    var trs = document.querySelectorAll('#kits-form-container .kit-card');
    for (var i = 0; i < trs.length; i++) {
        var tr = trs[i];
        var cbId = tr.id.replace('kr_', 'cb_kr_');
        var itemName = getCombo(cbId);
        if (!itemName) continue;
        
        items.push({
            id: tr.dataset.id || null,
            marca_vehiculo: marca,
            modelo_vehiculo: getCombo('kits-modelo') || 'TODOS LOS MODELOS',
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
    
    var btn = document.getElementById('kits-btn-guardar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...'; }
    
    Promise.all(promises).then(function() {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save me-1"></i>Guardar Kit'; }
        window._kitsCerrarModal();
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
    var filas = [['ID','Marca Vehículo','Modelo Vehículo','Tipo MP','Nombre Kit','Ítem (Artículo)','Cantidad','Unidad','Costo Unit.','Costo Total']];
    datos.forEach(function(k) {
        filas.push([k.id||'', k.marca_vehiculo||'', k.modelo_vehiculo||'TODOS LOS MODELOS', k.tipo_mp||'', k.nombre_kit||'',
            k.item_nombre||'', k.cantidad||0, k.unidad_medida||'',
            parseFloat(k.costo_unitario||0).toFixed(2), parseFloat(k.costo_total||0).toFixed(2)]);
    });
    var ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = [6,16,16,8,20,28,8,10,10,10].map(function(w){ return {wch:w}; });
    XLSX.utils.book_append_sheet(wb, ws, 'Kits MP');
    XLSX.writeFile(wb, 'KitsMP_'+new Date().toISOString().slice(0,10)+'.xlsx');
};

// ── Descargar Plantilla ───────────────────────────────────────────
window.kitsDescargarPlantilla = function() {
    var wb = XLSX.utils.book_new();
    var filas = [
        ['Marca Vehículo','Modelo Vehículo','Tipo MP','Nombre Kit','Ítem (Artículo)','Cantidad','Unidad','Costo Unit.'],
        ['VOLVO','TODOS LOS MODELOS','MP1','Kit 15K','Filtro de Aceite',1,'UND',25.00],
        ['VOLVO','TODOS LOS MODELOS','MP1','Kit 15K','Aceite Motor 15W40',12,'LT',18.50]
    ];
    var ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = [16,16,8,20,28,8,10,10].map(function(w){ return {wch:w}; });
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
                    modelo_vehiculo: String(r['Modelo Vehículo'] || r.modelo_vehiculo || '').trim().toUpperCase() || 'TODOS LOS MODELOS',
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


window.kitsActualizarTituloModal = function() {
    setTimeout(function() {
        var t = document.getElementById('kitsModal-titulo');
        if (!t) return;
        var mTxt = document.getElementById('kits-marca-txt');
        var modTxt = document.getElementById('kits-modelo-txt');
        var tTxt = document.getElementById('kits-tipomp-txt');
        
        var m = (mTxt ? mTxt.value.trim().toUpperCase() : '');
        var mod = (modTxt ? modTxt.value.trim().toUpperCase() : '');
        var tip = (tTxt ? tTxt.value.trim().toUpperCase() : '');

        var arr = [];
        if (m) arr.push(m);
        if (mod && mod !== 'TODOS LOS MODELOS') arr.push(mod);
        var middle = arr.length > 0 ? arr.join(' - ') : '';
        
        var str = '';
        if (middle) str += middle;
        if (tip) {
            if (str) str += ' | ';
            str += tip;
        }

        var mode = (document.getElementById('kits-form-container') && document.getElementById('kits-form-container').innerHTML !== '') ? 'Editar' : 'Configurar';

        if (str) {
            t.innerHTML = '<i class="bi bi-tools me-1 text-primary"></i>Kit: ' + str;
        } else {
            t.innerHTML = '<i class="bi bi-tools me-1 text-primary"></i>Configurar Kit de Mantenimiento';
        }
    }, 100);
};


window.kitsActualizarTituloModal = function() {
    setTimeout(function() {
        var t = document.getElementById('kitsModal-titulo');
        if (!t) return;
        var mTxt = document.getElementById('kits-marca-txt');
        var modTxt = document.getElementById('kits-modelo-txt');
        var tTxt = document.getElementById('kits-tipomp-txt');
        
        var m = (mTxt ? mTxt.value.trim().toUpperCase() : '');
        var mod = (modTxt ? modTxt.value.trim().toUpperCase() : '');
        var tip = (tTxt ? tTxt.value.trim().toUpperCase() : '');

        var arr = [];
        if (m) arr.push(m);
        if (mod && mod !== 'TODOS LOS MODELOS') arr.push(mod);
        var middle = arr.length > 0 ? arr.join(' - ') : '';
        
        var str = '';
        if (middle) str += middle;
        if (tip) {
            if (str) str += ' | ';
            str += tip;
        }

        var mode = (document.getElementById('kits-form-container') && document.getElementById('kits-form-container').innerHTML !== '') ? 'Editar' : 'Configurar';

        if (str) {
            t.innerHTML = '<i class="bi bi-tools me-1 text-primary"></i>Kit: ' + str;
        } else {
            t.innerHTML = '<i class="bi bi-tools me-1 text-primary"></i>Configurar Kit de Mantenimiento';
        }
    }, 100);
};


window.kitsActualizarTituloModal = function() {
    setTimeout(function() {
        var t = document.getElementById('kitsModal-titulo');
        if (!t) return;
        var mTxt = document.getElementById('kits-marca-txt');
        var modTxt = document.getElementById('kits-modelo-txt');
        var tTxt = document.getElementById('kits-tipomp-txt');
        
        var m = (mTxt ? mTxt.value.trim().toUpperCase() : '');
        var mod = (modTxt ? modTxt.value.trim().toUpperCase() : '');
        var tip = (tTxt ? tTxt.value.trim().toUpperCase() : '');

        var arr = [];
        if (m) arr.push(m);
        if (mod && mod !== 'TODOS LOS MODELOS') arr.push(mod);
        var middle = arr.length > 0 ? arr.join(' - ') : '';
        
        var str = '';
        if (middle) str += middle;
        if (tip) {
            if (str) str += ' | ';
            str += tip;
        }

        var mode = (document.getElementById('kits-form-container') && document.getElementById('kits-form-container').innerHTML !== '') ? 'Editar' : 'Configurar';

        if (str) {
            t.innerHTML = '<i class="bi bi-tools me-1 text-primary"></i>Kit: ' + str;
        } else {
            t.innerHTML = '<i class="bi bi-tools me-1 text-primary"></i>Configurar Kit de Mantenimiento';
        }
    }, 100);
};
