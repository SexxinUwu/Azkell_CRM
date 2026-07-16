const fs = require('fs');
const html = fs.readFileSync('c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/vista.html', 'utf8');
const idx = html.indexOf('id="form-inv-articulo"');
if (idx !== -1) {
    console.log(html.substring(idx, idx + 4000));
}
