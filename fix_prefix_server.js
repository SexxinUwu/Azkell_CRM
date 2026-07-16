const fs = require('fs');

const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/server.js';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes("SERV: 'inventario'")) {
    content = content.replace(
        /const tablas = \{ INV: 'inventario', ENT: 'entradas_inv', SAL: 'salidas_inv', SA: 'salidas_inv', PROV: 'proveedores_inv' \};/,
        `const tablas = { INV: 'inventario', SERV: 'inventario', ENT: 'entradas_inv', SAL: 'salidas_inv', SA: 'salidas_inv', PROV: 'proveedores_inv' };`
    );
    fs.writeFileSync(path, content);
    console.log('Patched server.js to support SERV prefix');
} else {
    console.log('Already patched');
}
