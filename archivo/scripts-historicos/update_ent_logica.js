const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let code = fs.readFileSync(path, 'utf8');

// 1. Initialize cb for OT
code = code.replace(
    /window\._cbInit\('ent-f-placa', window\._entPlacas, 'Buscar placa\.\.\.'\);/,
    "window._cbInit('ent-f-placa', window._entPlacas, 'Buscar placa...');\n  window._cbInit('ent-f-ot', window._entOts || [], 'Buscar OT...');"
);

// 2. Fetch OTs and Placas simultaneously
code = code.replace(
    /fetch\('\/api\/mantenimiento\/vehiculos'\)\.then/,
    "fetch('/api/mantenimiento/ot').then(r=>r.ok?r.json():[]).then(data=>{window._entOts=(data.data||[]).map(ot=>({value:ot.id,label:ot.id+' - '+ot.placa}));window._cbInit('ent-f-ot',window._entOts,'Buscar OT...');}).catch(()=>{}); fetch('/api/mantenimiento/vehiculos').then"
);

// 3. Toggle fields based on tipo_orden
const toggleLogic = `
window._entToggleTipoOrden = function() {
    var tipo = document.getElementById('ent-f-tipo-orden').value;
    if (tipo === 'Orden de Servicio') {
        document.getElementById('ent-placa-container').style.display = 'none';
        document.getElementById('ent-ot-container').style.display = 'block';
    } else {
        document.getElementById('ent-placa-container').style.display = 'block';
        document.getElementById('ent-ot-container').style.display = 'none';
    }
};
document.getElementById('ent-f-tipo-orden').addEventListener('change', window._entToggleTipoOrden);
`;

code = code.replace(
    /document\.getElementById\('ent-item-buscar'\)\.addEventListener\('input', window\._entFiltrarItems\);/,
    "document.getElementById('ent-item-buscar').addEventListener('input', window._entFiltrarItems);\n" + toggleLogic
);

// 4. Update window._entFiltrarItems to filter by tipo
const filterLogic = `
window._entFiltrarItems = function() {
    var q = (document.getElementById('ent-item-buscar').value || '').toLowerCase().trim();
    var tipoOrden = document.getElementById('ent-f-tipo-orden').value;
    var tbody = document.getElementById('ent-items-body');
    if (!tbody) return;
    
    var data = window._entInvData || [];
    var filtered = data.filter(function(item) {
        if (tipoOrden === 'Orden de Servicio') {
            if (item.tipo !== 'Servicio') return false;
        } else {
            if (item.tipo === 'Servicio') return false;
        }
        
        if (!q) return true;
        var txt = (item.codigo_articulo + ' ' + item.descripcion + ' ' + (item.marca||'') + ' ' + (item.familia||'') + ' ' + (item.codigo_barras||'')).toLowerCase();
        return txt.indexOf(q) !== -1;
    }).slice(0, 50);

    var html = '';
    filtered.forEach(function(item) {
        var pre = (item.moneda==='USD' ? '$' : 'S/');
        var cost = parseFloat(item.costo_referencial||0).toFixed(2);
        var subType = (item.tipo === 'Servicio') ? '<span class="badge bg-warning text-dark me-2">Servicio</span>' : '';
        html += '<tr class="ent-inv-row" onclick="window._entAgregarItem(\\'' + item.id + '\\')">' +
            '<td><div class="fw-bold text-primary">' + (item.codigo_articulo||'-') + '</div></td>' +
            '<td><div class="fw-semibold">' + subType + (item.descripcion||'-') + '</div><div style="font-size:0.7rem;color:#64748b;">' + (item.familia||'-') + ' • ' + (item.marca||'-') + '</div></td>' +
            '<td class="text-center">' + (item.unidad||'UND') + '</td>' +
            '<td class="text-center">' + (item.tipo==='Servicio' ? '-' : (parseFloat(item.stock_actual||0).toFixed(2))) + '</td>' +
            '<td class="text-end fw-bold" style="color:#0f172a;">' + pre + ' ' + cost + '</td>' +
            '<td class="text-center"><button class="btn btn-sm btn-light text-primary" style="border-radius:6px;"><i class="bi bi-plus-lg"></i></button></td>' +
        '</tr>';
    });
    
    if (filtered.length === 0) {
        html = '<tr><td colspan="6" class="text-center text-muted py-4">No se encontraron artículos con esos criterios.</td></tr>';
    }
    tbody.innerHTML = html;
};
`;

code = code.replace(/window\._entFiltrarItems = function\(\) \{[\s\S]*?\};\n/m, filterLogic + "\n");

// 5. In _entAbrirModal, call toggle
code = code.replace(
    /var condPago = document\.getElementById\('ent-f-condicion-pago'\);/,
    "var condPago = document.getElementById('ent-f-condicion-pago');\n    setTimeout(window._entToggleTipoOrden, 50);"
);

// 6. In _entAbrirEditar, map ot_id and call toggle
code = code.replace(
    /if \(fTipoOrden\) fTipoOrden\.value = entrada\.tipo_orden \|\| 'Orden de compra';/,
    "if (fTipoOrden) fTipoOrden.value = entrada.tipo_orden || 'Orden de compra';\n    window._cbSet('ent-f-ot', entrada.ot_id || '', entrada.ot_id || '');\n    setTimeout(window._entToggleTipoOrden, 50);"
);

// 7. _entGuardar needs to send ot_id
code = code.replace(
    /placa:\s*document\.getElementById\('ent-f-placa'\)\.value/,
    "placa: document.getElementById('ent-f-placa').value,\n        ot_id: document.getElementById('ent-f-ot').value"
);

fs.writeFileSync(path, code);
console.log('update_ent_logica.js applied!');
