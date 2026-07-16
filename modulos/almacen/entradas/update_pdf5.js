const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let code = fs.readFileSync(path, 'utf8');

const replacement = `
    var subtotalItems = 0;
    (d.items || []).forEach(function(it) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        subtotalItems += (cant * cu);
    });
    
    var totalReal = subtotalItems;
    if (d.tipo_igv === 'mas_igv') {
        totalReal = subtotalItems * 1.18;
    }
    
    // Fallback if no items for some reason
    if (totalReal === 0 && d.total_pen) {
        totalReal = parseFloat(d.total_pen);
        if (d.moneda === 'USD') {
            var tc = parseFloat(d.tipo_cambio || 3.4);
            if (tc > 0) totalReal = totalReal / tc;
        }
    }
    
    var monSimbolo = d.moneda === 'USD' ? 'USD' : 'PEN';
`;

// Replace the old totalReal calculation
code = code.replace(
    /var totalReal = parseFloat\(d\.total \|\| d\.total_pen \|\| 0\);\s*var monSimbolo = d\.moneda === 'USD' \? 'USD' : 'PEN';/,
    replacement
);

fs.writeFileSync(path, code);
console.log('Update 5 applied successfully!');
