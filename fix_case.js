const fs = require('fs');

// 1. Fix entradas/logica.js
const entPath = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let entCode = fs.readFileSync(entPath, 'utf8');
entCode = entCode.replace(/tipo === 'Orden de Servicio'/g, "tipo.toLowerCase() === 'orden de servicio'");
entCode = entCode.replace(/tipoOrden === 'Orden de Servicio'/g, "tipoOrden.toLowerCase() === 'orden de servicio'");
fs.writeFileSync(entPath, entCode);

// 2. Fix reportes-ot/logica.js
const otPath = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/mantenimiento/reportes-ot/logica.js';
let otCode = fs.readFileSync(otPath, 'utf8');
otCode = otCode.replace(/e\.tipo_orden === 'Orden de Servicio'/g, "(e.tipo_orden||'').toLowerCase() === 'orden de servicio'");
fs.writeFileSync(otPath, otCode);

// 3. Fix routes/taller.js
const tallerPath = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/routes/taller.js';
let tallerCode = fs.readFileSync(tallerPath, 'utf8');
tallerCode = tallerCode.replace(/e\.tipo_orden = 'Orden de Servicio'/g, "e.tipo_orden = 'Orden de servicio'");
fs.writeFileSync(tallerPath, tallerCode);

console.log('Fixed capitalization issues');
