const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let code = fs.readFileSync(path, 'utf8');

const regex = /var estadoHtml = isAnulado \? '<span class="badge bg-danger">ANULADA<\/span>' : '<span class="badge" style="background-color:#16a34a;">REGISTRADA<\/span>';/;

if (code.match(regex)) {
    code = code.replace(regex, `var estadoHtml = isAnulado ? '<span class="badge bg-danger">ANULADA</span>' : '<span class="badge" style="background-color:#16a34a;">REGISTRADA</span>';
          var tipoOrdBadge = (d.tipo_orden && d.tipo_orden.toLowerCase() === 'orden de servicio') 
                ? '<div class="badge bg-warning text-dark" style="font-size:0.6rem; letter-spacing:0.04em; margin-bottom:4px;">SERVICIO</div><br>' 
                : '<div class="badge bg-primary" style="font-size:0.6rem; letter-spacing:0.04em; margin-bottom:4px;">COMPRA</div><br>';`);
                
    // Insert into tr0
    code = code.replace(/'<td><span class="badge bg-secondary fw-normal" style="font-size:0.72rem;">' \+ _entEsc\(d.id \|\| ''\) \+ '<\/span><\/td>' \+/,
        `'<td class="text-center">' + tipoOrdBadge + '<span class="badge bg-secondary fw-normal" style="font-size:0.72rem;">' + _entEsc(d.id || '') + '</span></td>' +`);

    // Insert into trItem
    code = code.replace(/var tdId = esPrimero \? '<td rowspan="' \+ rowSpan \+ '"><span class="badge bg-secondary fw-normal" style="font-size:0.72rem;">' \+ _entEsc\(d.id \|\| ''\) \+ '<\/span><\/td>' : '';/,
        `var tdId = esPrimero ? '<td rowspan="' + rowSpan + '" class="text-center" style="vertical-align:middle;">' + tipoOrdBadge + '<span class="badge bg-secondary fw-normal" style="font-size:0.72rem;">' + _entEsc(d.id || '') + '</span></td>' : '';`);

    fs.writeFileSync(path, code);
    console.log('Badge injected successfully.');
} else {
    console.log('Could not find anchor for badge injection.');
}
