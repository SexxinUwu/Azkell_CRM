const fs = require('fs');

// Fix placa text set
const pathLogica = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let logica = fs.readFileSync(pathLogica, 'utf8');

const oldPlacaSet = /var placaInput = document\.getElementById\('ent-f-ot-placa'\);\s*if \(placaInput && ot && ot\.placa\) \{\s*placaInput\.value = ot\.placa;\s*\} else if \(placaInput\) \{\s*placaInput\.value = '';\s*\}/;

const newPlacaSet = `if (ot && ot.placa) {
                if (typeof window._cbSet === 'function') {
                    window._cbSet('ent-f-ot-placa', ot.placa, ot.placa);
                }
            } else {
                if (typeof window._cbReset === 'function') {
                    window._cbReset('ent-f-ot-placa');
                }
            }`;

if (oldPlacaSet.test(logica)) {
    logica = logica.replace(oldPlacaSet, newPlacaSet);
    fs.writeFileSync(pathLogica, logica);
    console.log('Fixed placa value setting');
} else {
    console.log('Could not find placa setting code');
}

// Add entradas_inv costs to taller OT query
const pathTaller = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/routes/taller.js';
let taller = fs.readFileSync(pathTaller, 'utf8');

// Looking for the cost query in taller.js
const costQueryRegex = /(COALESCE\(\(\s*SELECT SUM\(s\.total_pen\)\s*FROM salidas_inv s WHERE s\.ticket_ot = o\.ticket_entrada\s*\),\s*0\))/g;

if (costQueryRegex.test(taller)) {
    const newCostQuery = `$1
              +
              COALESCE((
                  SELECT SUM(e.total_pen)
                  FROM entradas_inv e 
                  WHERE e.ot_id = o.ticket_entrada AND e.tipo_orden = 'Orden de servicio' AND (e.estado IS NULL OR e.estado != 'Anulado')
              ), 0)`;
              
    taller = taller.replace(costQueryRegex, newCostQuery);
    fs.writeFileSync(pathTaller, taller);
    console.log('Added entradas_inv costs to taller OTs');
} else {
    console.log('Could not find cost query in taller.js');
}
