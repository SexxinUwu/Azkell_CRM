const fs = require('fs');
const html = fs.readFileSync('c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/vista.html', 'utf8');
const ids = [...html.matchAll(/id=\"([^\"]+)\"/g)].map(m => m[1]);
console.log(ids.filter(id => id.startsWith('inv-f-') || id.includes('unidad') || id.includes('image') || id.includes('foto') || id.includes('upload')));
