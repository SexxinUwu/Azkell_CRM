const fs = require('fs');
const p = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/logica.js';
let c = fs.readFileSync(p, 'utf8');
c = c.replace(/\\'none\\'/g, "'none'");
c = c.replace(/\\'\\'/g, "''");
fs.writeFileSync(p, c);
console.log('Fixed syntax error');
