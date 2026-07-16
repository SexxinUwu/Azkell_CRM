const fs = require('fs');

const pathVista = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/vista.html';
let vista = fs.readFileSync(pathVista, 'utf8');

// Use a more robust regex for Código
if (!vista.includes('<th>Tipo Orden</th>')) {
    vista = vista.replace(
        /<th>C[^\<]+digo<\/th>/i,
        '<th>C\u00f3digo</th>\n              <th>Tipo Orden</th>'
    );
    fs.writeFileSync(pathVista, vista);
    console.log('Patched vista.html successfully');
} else {
    console.log('vista.html already patched');
}
