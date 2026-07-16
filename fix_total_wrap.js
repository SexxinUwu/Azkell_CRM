const fs = require('fs');

const pathVista = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/vista.html';
let vista = fs.readFileSync(pathVista, 'utf8');

vista = vista.replace(
    /<th class="text-end col-hide-mob">Total<\/th>/,
    '<th class="text-end col-hide-mob" style="white-space:nowrap; min-width:90px;">Total</th>'
);

fs.writeFileSync(pathVista, vista);
console.log('Fixed vista.html total column');

const pathLogica = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let logica = fs.readFileSync(pathLogica, 'utf8');

logica = logica.replace(
    /'<td class="text-end col-hide-mob">' \+ totalFmt \+ '<\/td>' \+/g,
    `'<td class="text-end col-hide-mob" style="white-space:nowrap;">' + totalFmt + '</td>' +`
);

logica = logica.replace(
    /'<td class="text-end col-hide-mob">' \+ \(isFirst \? totalFmt : ''\) \+ '<\/td>' \+/g,
    `'<td class="text-end col-hide-mob" style="white-space:nowrap;">' + (isFirst ? totalFmt : '') + '</td>' +`
);

fs.writeFileSync(pathLogica, logica);
console.log('Fixed logica.js total column');
