const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// I need to find the empty loop:
// for (var i = 0; i < trs.length; i++) {
//     }
// And replace it with the correct body!

const emptyLoopRegex = /for \(var i = 0; i < trs\.length; i\+\+\) \{\s*\}/;

const correctLoop = `for (var i = 0; i < trs.length; i++) {
        var tr = trs[i];
        var cbId = tr.id.replace('kr_', 'cb_kr_');
        var itemName = getCombo(cbId);
        if (!itemName) continue;
        
        items.push({
            id: tr.dataset.id || null,
            marca_vehiculo: marca,
            modelo_vehiculo: getCombo('kits-modelo') || null,
            tipo_mp: tipo,
            item_nombre: itemName,
            cantidad: parseFloat(tr.querySelector('.kit-cant').value) || 1,
            unidad_medida: tr.querySelector('.kit-unid').value || 'UND',
            costo_unitario: parseFloat(tr.querySelector('.kit-costo').value) || 0,
            costo_total: parseFloat(tr.querySelector('.kit-total').value) || 0
        });
    }`;

js = js.replace(emptyLoopRegex, correctLoop);

fs.writeFileSync(fileJs, js, 'utf8');
