// ================================================================
// MÓDULO ALMACÉN / KARDEX — Lógica SPA Aislada
// ================================================================

window._kdxInvData   = window._kdxInvData   || [];
window._kdxMovData   = window._kdxMovData   || [];
window._kdxSelId     = window._kdxSelId     || null;
window._kdxStockBase = window._kdxStockBase || 0;

window.init_kardex = function() {
    window._kdxCargarInventario();
};

window._kdxCargarInventario = function() {
    fetch('/api/almacen/inventario')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._kdxInvData = data || [];
            var dl = document.getElementById('kdx-art-list');
            if (dl) {
                dl.innerHTML = data.map(function(d) {
                    return '<option value="'+_kdxEsc(d.id+' — '+d.descripcion)+'" data-id="'+_kdxEsc(d.id)+'">';
                }).join('');
            }
        })
        .catch(function() {});
};

window._kdxCargarKardex = function() {
    var input = document.getElementById('kdx-buscar-art');
    if (!input) return;
    var val = input.value.trim();
    var invId = val.split(' — ')[0].trim();
    if (!invId) { alert('Ingresa o selecciona un artículo.'); return; }

    // Verificar que el artículo existe
    var item = window._kdxInvData.find(function(d) { return d.id === invId; });
    if (!item) {
        // Intentar búsqueda parcial
        item = window._kdxInvData.find(function(d) {
            return d.descripcion.toLowerCase().includes(val.toLowerCase());
        });
    }
    if (!item) { alert('Artículo no encontrado. Intenta con el código INV-XXXX exacto.'); return; }

    window._kdxSelId = item.id;
    window._kdxStockBase = parseFloat(item.stock_regularizado || 0);

    // Mostrar info básica
    var nombre = document.getElementById('kdx-art-nombre');
    if (nombre) nombre.textContent = item.descripcion || '—';
    var codigo = document.getElementById('kdx-art-codigo');
    if (codigo) codigo.textContent = item.id + (item.familia ? ' · ' + item.familia : '') + (item.almacen ? ' · ' + item.almacen : '');
    var stockBase = document.getElementById('kdx-stock-base');
    if (stockBase) stockBase.textContent = window._kdxStockBase.toFixed(2) + ' ' + (item.unidad||'');
    var fechaReg = document.getElementById('kdx-fecha-reg');
    if (fechaReg) fechaReg.textContent = item.fecha_regularizacion ? 'Desde ' + String(item.fecha_regularizacion).split('T')[0] : 'Stock inicial';

    var infoEl = document.getElementById('kdx-info-art');
    if (infoEl) infoEl.style.display = '';

    var placeholder = document.getElementById('kdx-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    var tabla = document.getElementById('tabla-kardex');
    if (tabla) tabla.style.display = '';

    var tbody = document.getElementById('tbody-kardex');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4"><div class="spinner-border spinner-border-sm me-2"></div>Cargando movimientos...</td></tr>';

    fetch('/api/almacen/kardex/' + encodeURIComponent(item.id))
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(res) {
            window._kdxMovData = res.movimientos || [];
            window._kdxRenderKardex(res, item);
        })
        .catch(function(err) {
            var t = document.getElementById('tbody-kardex');
            if (t) t.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Error: '+err.message+'</td></tr>';
        });
};

window._kdxRenderKardex = function(res, item) {
    var movs = res.movimientos || [];
    var tbody = document.getElementById('tbody-kardex');
    if (!tbody) return;

    // Calcular totales
    var totalEntradas = 0;
    var totalSalidas  = 0;
    movs.forEach(function(m) {
        if (m.tipo === 'Entrada') totalEntradas += parseFloat(m.cantidad) || 0;
        else totalSalidas += parseFloat(m.cantidad) || 0;
    });
    var stockActual = window._kdxStockBase + totalEntradas - totalSalidas;

    var elEnt = document.getElementById('kdx-total-entradas');
    if (elEnt) elEnt.textContent = '+' + totalEntradas.toFixed(2) + ' / −' + totalSalidas.toFixed(2);
    var elAct = document.getElementById('kdx-stock-actual');
    if (elAct) elAct.textContent = stockActual.toFixed(2) + ' ' + (item.unidad||'');

    var btnExp = document.getElementById('btn-export-kardex');
    if (btnExp) btnExp.style.display = movs.length ? '' : 'none';

    if (!movs.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox me-2"></i>Sin movimientos registrados para este artículo</td></tr>';
        return;
    }

    tbody.innerHTML = movs.map(function(m, i) {
        var fecha = m.fecha ? String(m.fecha).split('T')[0] : '—';
        var esEntrada = m.tipo === 'Entrada';
        var tipoCls = esEntrada ? 'text-success' : 'text-danger';
        var tipoIcon = esEntrada ? '<i class="bi bi-arrow-down-circle-fill text-success me-1"></i>' : '<i class="bi bi-arrow-up-circle-fill text-danger me-1"></i>';
        var cantSign = esEntrada ? '+' : '−';
        var cu   = parseFloat(m.costo_unitario||0);
        var cant = parseFloat(m.cantidad||0);
        var imp  = parseFloat(m.importe||0);
        var saldo = m.saldo != null ? m.saldo.toFixed(4) : '—';
        return '<tr>'+
            '<td>'+fecha+'</td>'+
            '<td>'+tipoIcon+'<span class="'+tipoCls+' fw-semibold">'+m.tipo+'</span></td>'+
            '<td><span class="badge bg-secondary fw-normal small">'+_kdxEsc(m.doc_id||'—')+'</span></td>'+
            '<td><small>'+_kdxEsc(m.contraparte||'—')+'</small></td>'+
            '<td class="text-end '+tipoCls+' fw-semibold">'+cantSign+cant.toLocaleString('es-PE',{minimumFractionDigits:4,maximumFractionDigits:4})+'</td>'+
            '<td class="text-end"><small>'+cu.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:4})+'</small></td>'+
            '<td class="text-end"><small>'+imp.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})+'</small></td>'+
            '<td class="text-end fw-bold">'+saldo+'</td>'+
        '</tr>';
    }).join('');
};

// ── Export Excel ──────────────────────────────────────────────────
window.exportarKardexExcel = function() {
    var movs = window._kdxMovData || [];
    if (!movs.length) { alert('No hay movimientos para exportar.'); return; }
    var cab = ['Fecha','Tipo','Documento','Contraparte','Cantidad','Costo Unit.','Importe','Saldo'];
    var filas = movs.map(function(m) {
        return [m.fecha?String(m.fecha).split('T')[0]:'', m.tipo, m.doc_id||'', m.contraparte||'',
                parseFloat(m.cantidad||0), parseFloat(m.costo_unitario||0),
                parseFloat(m.importe||0), m.saldo!=null?m.saldo:''];
    });
    var ws = XLSX.utils.aoa_to_sheet([cab].concat(filas));
    var wb = XLSX.utils.book_new();
    var sheet = 'Kardex_'+(window._kdxSelId||'artículo');
    XLSX.utils.book_append_sheet(wb, ws, sheet.substring(0,31));
    XLSX.writeFile(wb, 'Kardex_'+sheet+'.xlsx');
};

function _kdxEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
